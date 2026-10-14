/* ============================================================
   Esquema de los datos de una sección: un mini-lenguaje de campos.

   Cada tipo de sección declara sus campos UNA vez (registry.ts) y de
   esa declaración salen tres cosas que antes vivían por separado y se
   desincronizaban:
     - el tipo TS de la data (`DataOf<typeof campos>`),
     - el normalizador tolerante que usan el storefront y el editor,
     - las reglas que valida el backend (se exportan en el contrato JSON,
       ver contract.ts).
   ============================================================ */

import { normalizeRichDoc, RICH_TEXT_MAX, type RichDoc } from './rich-text';

/** Largo máximo de un texto de una línea (títulos, nombres, botones). */
export const SHORT_TEXT_MAX = 200;
/** Largo máximo de un texto largo (descripciones, respuestas, citas). */
export const LONG_TEXT_MAX = 2000;
/** Largo máximo de una URL (links, imágenes, videos). */
export const URL_MAX = 2000;
/** Largo máximo del nombre propio de una sección o de un ítem. */
export const LABEL_MAX = 80;

export type FieldSpec =
  /** Texto de una línea. `fallback` es lo que vale si falta o no es texto. */
  | { kind: 'string'; max: number; fallback: string }
  /** Texto largo (varias líneas). */
  | { kind: 'text'; max: number; fallback: string }
  /** Link al que se navega: rutas relativas, http(s), mailto:, tel:. Nunca javascript:. */
  | { kind: 'url'; fallback: string }
  /** Origen de una imagen o video: http(s) o ruta relativa. */
  | { kind: 'media'; fallback: string }
  | { kind: 'boolean'; fallback: boolean }
  | { kind: 'enum'; values: readonly string[]; fallback: string }
  /** Lista de textos sueltos: URLs de imágenes o ids de productos. */
  | { kind: 'strings'; of: 'media' | 'id'; max: number }
  /** Lista de ítems (objetos), cada uno con sus campos y un `label` opcional. */
  | { kind: 'items'; fields: FieldsSpec; max: number }
  /** Número entero entre `min` y `max` (segundos, días, columnas). Fuera de rango se acota. */
  | { kind: 'number'; min: number; max: number; fallback: number }
  /**
   * Fecha y hora en ISO 8601 con zona ("2026-11-20T03:00:00.000Z"). Se guarda
   * en UTC; el editor la muestra y la pide en hora de Argentina. Vacío = sin fecha.
   */
  | { kind: 'datetime'; fallback: string }
  /** Texto con formato como árbol (ver rich-text.ts), nunca HTML. `max`: caracteres del JSON. */
  | { kind: 'richtext'; max: number };

export type FieldsSpec = Readonly<Record<string, FieldSpec>>;

/* ---- Constructores: lo que se escribe en el registro ---- */

export const field = {
  string: (fallback = '', max = SHORT_TEXT_MAX) => ({ kind: 'string', max, fallback }) as const,
  text: (fallback = '', max = LONG_TEXT_MAX) => ({ kind: 'text', max, fallback }) as const,
  url: (fallback = '') => ({ kind: 'url', fallback }) as const,
  media: (fallback = '') => ({ kind: 'media', fallback }) as const,
  boolean: (fallback: boolean) => ({ kind: 'boolean', fallback }) as const,
  enum: <const V extends readonly string[]>(values: V, fallback: V[number]) =>
    ({ kind: 'enum', values, fallback }) as const,
  strings: (of: 'media' | 'id', max: number) => ({ kind: 'strings', of, max }) as const,
  items: <const F extends FieldsSpec>(fields: F, max: number) => ({ kind: 'items', fields, max }) as const,
  number: (fallback: number, min: number, max: number) => ({ kind: 'number', min, max, fallback }) as const,
  datetime: (fallback = '') => ({ kind: 'datetime', fallback }) as const,
  richtext: (max = RICH_TEXT_MAX) => ({ kind: 'richtext', max }) as const,
};

/* ---- El tipo TS que sale de un esquema ---- */

/** Lo que agrega todo ítem de una lista: un nombre propio para ubicarlo en el editor. */
export interface ItemBase {
  /** Nombre que le puso el comercio (solo se ve en el editor). Vacío = se deriva del contenido. */
  label?: string;
}

type ValueOf<F> = F extends { kind: 'string' | 'text' | 'url' | 'media' }
  ? string
  : F extends { kind: 'boolean' }
    ? boolean
    : F extends { kind: 'enum'; values: readonly (infer V)[] }
      ? V
      : F extends { kind: 'strings' }
        ? string[]
        : F extends { kind: 'items'; fields: infer S }
          ? (DataOf<S> & ItemBase)[]
          : F extends { kind: 'number' }
            ? number
            : F extends { kind: 'datetime' }
              ? string
              : F extends { kind: 'richtext' }
                ? RichDoc
                : never;

/** La data normalizada de un esquema: todos los campos presentes y con su tipo. */
export type DataOf<S> = { -readonly [K in keyof S]: ValueOf<S[K]> };

/* ---- URLs seguras ---- */

/**
 * Esquemas que el navegador ejecutaría o que no tienen sentido en un link de
 * la tienda. Se compara después de quitar espacios y caracteres de control:
 * el navegador ignora un tab o un salto de línea en medio de "java\nscript:".
 */
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;
const LINK_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);
const MEDIA_SCHEMES = new Set(['http', 'https']);

// eslint-disable-next-line no-control-regex -- justamente los caracteres de control son el problema
const INVISIBLE = /[\u0000- \u007f-\u009f]/g;

function schemeOf(value: string): string | null {
  const m = SCHEME.exec(value.replace(INVISIBLE, ''));
  return m ? m[1]!.toLowerCase() : null;
}

/** ¿Se puede usar como `href` de la tienda? Relativas, http(s), mailto: y tel:. */
export function isSafeLink(value: string): boolean {
  if (value.length > URL_MAX) return false;
  const scheme = schemeOf(value);
  return scheme === null || LINK_SCHEMES.has(scheme);
}

/** ¿Se puede usar como `src` de una imagen o video? Relativas y http(s). */
export function isSafeMedia(value: string): boolean {
  if (value.length > URL_MAX) return false;
  const scheme = schemeOf(value);
  return scheme === null || MEDIA_SCHEMES.has(scheme);
}

/* ---- Normalización tolerante ---- */

export const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function normalizeField(spec: FieldSpec, raw: unknown): unknown {
  switch (spec.kind) {
    case 'string':
    case 'text':
      return typeof raw === 'string' ? raw : typeof raw === 'number' ? String(raw) : spec.fallback;
    case 'url':
      // Un link peligroso no se "arregla": se descarta. Así el render nunca
      // pone un javascript: en un href aunque el dato viejo lo tenga.
      return typeof raw === 'string' && isSafeLink(raw) ? raw : spec.fallback;
    case 'media':
      return typeof raw === 'string' && isSafeMedia(raw) ? raw : spec.fallback;
    case 'boolean':
      return typeof raw === 'boolean' ? raw : spec.fallback;
    case 'enum':
      return typeof raw === 'string' && spec.values.includes(raw) ? raw : spec.fallback;
    case 'strings': {
      if (!Array.isArray(raw)) return [];
      const ok = spec.of === 'media' ? isSafeMedia : () => true;
      // Los vacíos se descartan: una imagen '' es un hueco en el carrusel.
      return raw.filter((v): v is string => typeof v === 'string' && v.trim() !== '' && ok(v));
    }
    case 'items':
      if (!Array.isArray(raw)) return [];
      // Un null o un número en medio de la lista (un borrador a medio guardar,
      // un JSON editado a mano) antes tiraba la portada entera. Se descarta.
      return raw.filter(isPlainObject).map((item) => normalizeItem(spec.fields, item));
    case 'number':
      return normalizeNumber(spec, raw);
    case 'datetime':
      return typeof raw === 'string' && (raw === '' || isIsoDateTime(raw)) ? raw : spec.fallback;
    case 'richtext':
      return normalizeRichDoc(raw, isSafeLink, spec.max);
  }
}

function normalizeNumber(spec: { min: number; max: number; fallback: number }, raw: unknown): number {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return spec.fallback;
  return Math.min(spec.max, Math.max(spec.min, Math.round(n)));
}

/** ISO 8601 con fecha, hora y zona (Z u offset). Lo mismo que acepta el backend. */
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,7})?)?(?:Z|[+-]\d{2}:\d{2})$/;

/** ¿Es una fecha y hora completa, con zona, que existe? ("2026-02-30T…" no). */
export function isIsoDateTime(value: string): boolean {
  if (!ISO_DATE_TIME.test(value)) return false;
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return false;
  // Date.parse "corrige" el 30 de febrero al 2 de marzo: se compara el día escrito.
  const [y, m, d] = value.slice(0, 10).split('-').map(Number) as [number, number, number];
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

function normalizeItem(fields: FieldsSpec, raw: Record<string, unknown>): Record<string, unknown> {
  const out = normalizeFields(fields, raw);
  if (typeof raw.label === 'string' && raw.label.trim() !== '') out.label = raw.label;
  else delete out.label;
  return out;
}

/**
 * Normaliza un objeto según su esquema. Nunca tira: cualquier cosa que no sea
 * un objeto vale `{}`, y cada campo cae a su `fallback` si falta o tiene otro
 * tipo. Los campos que el esquema no conoce se conservan tal cual: los pudo
 * haber escrito una versión más nueva del editor, y perderlos al guardar desde
 * una pestaña vieja sería borrar trabajo.
 */
export function normalizeFields(fields: FieldsSpec, raw: unknown): Record<string, unknown> {
  const src = isPlainObject(raw) ? raw : {};
  const out: Record<string, unknown> = { ...src };
  for (const [key, spec] of Object.entries(fields)) out[key] = normalizeField(spec, src[key]);
  return out;
}
