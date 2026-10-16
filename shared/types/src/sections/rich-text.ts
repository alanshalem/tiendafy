/* ============================================================
   Texto con formato de las secciones (títulos, negrita, cursiva,
   listas, citas y links), guardado como ÁRBOL y nunca como HTML.

   Es el JSON que produce el editor de texto del panel (Tiptap /
   ProseMirror), recortado a una lista cerrada de nodos y marcas. La
   tienda lo dibuja con elementos de React a partir de esa lista: no hay
   `dangerouslySetInnerHTML`, así que un <script> o un onerror pegado en
   el tema no tiene por dónde entrar. Lo que no está en la lista se
   descarta al normalizar (y el backend no lo deja guardar).
   ============================================================ */

/** Tope por defecto del texto con formato, en caracteres del JSON guardado. */
export const RICH_TEXT_MAX = 20_000;

/** Niveles de título que se aceptan. La tienda los dibuja debajo del h2 de la sección. */
const RICH_HEADING_LEVELS = [2, 3, 4] as const;
export type RichHeadingLevel = (typeof RICH_HEADING_LEVELS)[number];

/** Cuántos niveles se pueden anidar (una lista dentro de una cita dentro de una lista…). */
export const RICH_MAX_DEPTH = 6;

export type RichMark = { type: 'bold' } | { type: 'italic' } | { type: 'link'; attrs: { href: string } };

export type RichInline = { type: 'text'; text: string; marks?: RichMark[] } | { type: 'hardBreak' };

export interface RichListItem {
  type: 'listItem';
  content: RichBlock[];
}

export type RichBlock =
  | { type: 'paragraph'; content?: RichInline[] }
  | { type: 'heading'; attrs: { level: RichHeadingLevel }; content?: RichInline[] }
  | { type: 'bulletList'; content: RichListItem[] }
  | { type: 'orderedList'; content: RichListItem[] }
  | { type: 'blockquote'; content: RichBlock[] };

export interface RichDoc {
  type: 'doc';
  content: RichBlock[];
}

/** Los nombres de nodos y marcas que se aceptan (los mismos que valida el backend). */
export const RICH_NODES = [
  'doc',
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'text',
  'hardBreak',
] as const;
export const RICH_MARKS = ['bold', 'italic', 'link'] as const;

export const emptyRichDoc = (): RichDoc => ({ type: 'doc', content: [] });

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function normalizeMarks(raw: unknown, isSafeLink: (href: string) => boolean): RichMark[] {
  const out: RichMark[] = [];
  const seen = new Set<string>();
  for (const m of list(raw)) {
    if (!isObj(m) || typeof m.type !== 'string' || seen.has(m.type)) continue;
    if (m.type === 'bold' || m.type === 'italic') out.push({ type: m.type });
    else if (m.type === 'link') {
      const href = isObj(m.attrs) && typeof m.attrs.href === 'string' ? m.attrs.href.trim() : '';
      // Un link peligroso o vacío se descarta; el texto queda.
      if (!href || !isSafeLink(href)) continue;
      out.push({ type: 'link', attrs: { href } });
    } else continue;
    seen.add(m.type);
  }
  return out;
}

function normalizeInline(raw: unknown, isSafeLink: (href: string) => boolean): RichInline[] {
  const out: RichInline[] = [];
  for (const n of list(raw)) {
    if (!isObj(n)) continue;
    if (n.type === 'hardBreak') out.push({ type: 'hardBreak' });
    else if (n.type === 'text' && typeof n.text === 'string' && n.text !== '') {
      const marks = normalizeMarks(n.marks, isSafeLink);
      out.push(marks.length > 0 ? { type: 'text', text: n.text, marks } : { type: 'text', text: n.text });
    }
  }
  return out;
}

function withInline<T extends object>(node: T, content: RichInline[]): T & { content?: RichInline[] } {
  return content.length > 0 ? { ...node, content } : node;
}

function normalizeBlocks(raw: unknown, depth: number, isSafeLink: (href: string) => boolean): RichBlock[] {
  if (depth > RICH_MAX_DEPTH) return [];
  const out: RichBlock[] = [];
  for (const n of list(raw)) {
    if (!isObj(n)) continue;
    switch (n.type) {
      case 'paragraph':
        out.push(withInline({ type: 'paragraph' as const }, normalizeInline(n.content, isSafeLink)));
        break;
      case 'heading': {
        const raw = isObj(n.attrs) ? Number(n.attrs.level) : NaN;
        // Un h1 (o un nivel raro) baja al primero que se acepta: la página tiene un solo h1.
        const level = (RICH_HEADING_LEVELS as readonly number[]).includes(raw)
          ? (raw as RichHeadingLevel)
          : RICH_HEADING_LEVELS[0];
        out.push(
          withInline({ type: 'heading' as const, attrs: { level } }, normalizeInline(n.content, isSafeLink)),
        );
        break;
      }
      case 'bulletList':
      case 'orderedList': {
        const items: RichListItem[] = list(n.content)
          .filter(isObj)
          .filter((li) => li.type === 'listItem')
          .map((li) => ({
            type: 'listItem' as const,
            content: normalizeBlocks(li.content, depth + 1, isSafeLink),
          }));
        if (items.length > 0) out.push({ type: n.type, content: items });
        break;
      }
      case 'blockquote': {
        const content = normalizeBlocks(n.content, depth + 1, isSafeLink);
        if (content.length > 0) out.push({ type: 'blockquote', content });
        break;
      }
      // Lo demás (imágenes, código, tablas, nodos de otra versión) no entra.
    }
  }
  return out;
}

/**
 * Un texto con formato válido a partir de cualquier cosa. Nunca tira: lo que
 * no es un documento vale un documento vacío. Si el JSON pasa de `max`
 * caracteres, se cortan los bloques del final (no se parte una palabra).
 * Normalizar lo normalizado no cambia nada.
 */
export function normalizeRichDoc(
  raw: unknown,
  isSafeLink: (href: string) => boolean,
  max: number = RICH_TEXT_MAX,
): RichDoc {
  if (!isObj(raw) || raw.type !== 'doc') return emptyRichDoc();
  const blocks = normalizeBlocks(raw.content, 1, isSafeLink);
  const doc = emptyRichDoc();
  let size = JSON.stringify(doc).length;
  for (const b of blocks) {
    const len = JSON.stringify(b).length + 1;
    if (size + len > max) break;
    doc.content.push(b);
    size += len;
  }
  return doc;
}

function inlineText(content: RichInline[] | undefined): string {
  return (content ?? []).map((n) => (n.type === 'text' ? n.text : ' ')).join('');
}

/** El texto plano de un documento (resúmenes, buscador, "¿está vacío?"). */
export function richDocText(doc: RichDoc): string {
  const walk = (blocks: RichBlock[]): string[] =>
    blocks.flatMap((b) => {
      switch (b.type) {
        case 'paragraph':
        case 'heading':
          return [inlineText(b.content)];
        case 'bulletList':
        case 'orderedList':
          return b.content.flatMap((li) => walk(li.content));
        case 'blockquote':
          return walk(b.content);
      }
    });
  return walk(doc.content)
    .map((s) => s.trim())
    .filter(Boolean)
    .join('\n');
}

/** Un documento a partir de párrafos de texto plano (contenido de ejemplo, tests). */
export function richDocFromText(...paragraphs: string[]): RichDoc {
  return {
    type: 'doc',
    content: paragraphs.map((text) =>
      text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' },
    ),
  };
}
