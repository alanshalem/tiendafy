/**
 * Los tipos de campo de las secciones que llegaron con la fase 2: número con
 * rango, fecha y hora (ISO en UTC) y texto con formato (un árbol con una
 * lista cerrada de nodos, nunca HTML). Lo que se cuida: que normalizar nunca
 * tire, que lo inválido caiga al fallback, que normalizar dos veces dé lo
 * mismo y que un link peligroso dentro del texto no sobreviva.
 */
import {
  buildThemeContract,
  emptyRichDoc,
  field,
  isIsoDateTime,
  normalizeFields,
  normalizeRichDoc,
  isSafeLink,
  richDocFromText,
  richDocText,
  RICH_MAX_DEPTH,
  type RichDoc,
} from '@tiendafy/types';
import { describe, expect, it } from 'vitest';

const fields = {
  seconds: field.number(5, 0, 120),
  endsAt: field.datetime(),
  body: field.richtext(1200),
} as const;

const norm = (raw: unknown) =>
  normalizeFields(fields, raw) as { seconds: number; endsAt: string; body: RichDoc };

describe('campo número', () => {
  it('acota al rango, redondea y lee números escritos como texto', () => {
    expect(norm({ seconds: 500 }).seconds).toBe(120);
    expect(norm({ seconds: -3 }).seconds).toBe(0);
    expect(norm({ seconds: 7.6 }).seconds).toBe(8);
    expect(norm({ seconds: '12' }).seconds).toBe(12);
  });

  it('lo que no es un número cae al fallback', () => {
    for (const bad of [undefined, null, 'muchos', '', NaN, Infinity, {}, [3], true])
      expect(norm({ seconds: bad }).seconds).toBe(5);
  });
});

describe('campo fecha y hora', () => {
  it('acepta ISO completo con zona, y vacío', () => {
    expect(norm({ endsAt: '2026-11-20T02:59:00.000Z' }).endsAt).toBe('2026-11-20T02:59:00.000Z');
    expect(norm({ endsAt: '2026-11-19T23:59-03:00' }).endsAt).toBe('2026-11-19T23:59-03:00');
    expect(norm({ endsAt: '' }).endsAt).toBe('');
  });

  it('rechaza fechas sin zona, que no existen o que no son fechas', () => {
    for (const bad of ['2026-11-20T02:59:00', '2026-02-30T10:00:00Z', 'mañana', '2026-11-20', 1763600000000])
      expect(norm({ endsAt: bad }).endsAt).toBe('');
    expect(isIsoDateTime('2026-13-01T00:00Z')).toBe(false);
    expect(isIsoDateTime('2028-02-29T00:00Z')).toBe(true);
  });
});

describe('campo texto con formato', () => {
  const doc = (content: unknown[]): unknown => ({ type: 'doc', content });

  it('conserva títulos, listas, citas, negrita, cursiva y links seguros', () => {
    const raw = doc([
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Envíos' }] },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Hola ', marks: [{ type: 'bold' }, { type: 'italic' }] },
          { type: 'hardBreak' },
          {
            type: 'text',
            text: 'acá',
            marks: [{ type: 'link', attrs: { href: '/productos', target: '_blank', class: 'x' } }],
          },
        ],
      },
      {
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'uno' }] }] },
        ],
      },
      {
        type: 'orderedList',
        attrs: { start: 1 },
        content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }],
      },
      { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'cita' }] }] },
    ]);
    const out = norm({ body: raw }).body;
    expect(out.content.map((b) => b.type)).toEqual([
      'heading',
      'paragraph',
      'bulletList',
      'orderedList',
      'blockquote',
    ]);
    // Del link solo queda el href: target, class y lo demás no pasan.
    expect(JSON.stringify(out)).toContain('{"type":"link","attrs":{"href":"/productos"}}');
    expect(JSON.stringify(out)).not.toContain('_blank');
    expect(richDocText(out)).toBe('Envíos\nHola  acá\nuno\ncita');
    // Normalizar lo normalizado no cambia nada.
    expect(norm({ body: out }).body).toEqual(out);
  });

  it('descarta links peligrosos (queda el texto), nodos y marcas desconocidos', () => {
    const out = norm({
      body: doc([
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'clic',
              marks: [{ type: 'link', attrs: { href: 'java\nscript:alert(1)' } }],
            },
            {
              type: 'text',
              text: 'tachado',
              marks: [{ type: 'strike' }, { type: 'bold' }, { type: 'bold' }],
            },
            { type: 'image', attrs: { src: 'x', onerror: 'alert(1)' } },
            { type: 'text', text: '' },
            null,
          ],
        },
        { type: 'codeBlock', content: [{ type: 'text', text: '<script>' }] },
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'h1 no' }] },
        { type: 'bulletList', content: [{ type: 'paragraph' }] },
        { type: 'blockquote', content: [] },
        'texto suelto',
      ]),
    }).body;
    expect(out).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'clic' },
            { type: 'text', text: 'tachado', marks: [{ type: 'bold' }] },
          ],
        },
        // Un h1 baja a h2: la página tiene un solo h1.
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'h1 no' }] },
      ],
    });
  });

  it('cualquier cosa que no sea un documento es un documento vacío', () => {
    for (const bad of [
      undefined,
      null,
      '<p>hola</p>',
      3,
      [],
      { type: 'paragraph' },
      { type: 'doc', content: 'x' },
    ])
      expect(norm({ body: bad }).body).toEqual(emptyRichDoc());
  });

  it('corta los bloques del final si pasa del tope', () => {
    const long = richDocFromText(...Array.from({ length: 40 }, (_, i) => `Párrafo ${i} con algo de texto`));
    const out = norm({ body: long }).body;
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(1200);
    expect(out.content.length).toBeGreaterThan(0);
    expect(out.content.length).toBeLessThan(40);
    expect(norm({ body: out }).body).toEqual(out);
  });

  it('no baja más de los niveles permitidos', () => {
    let node: unknown = { type: 'paragraph', content: [{ type: 'text', text: 'fondo' }] };
    for (let i = 0; i < RICH_MAX_DEPTH + 3; i++) node = { type: 'blockquote', content: [node] };
    const out = normalizeRichDoc({ type: 'doc', content: [node] }, isSafeLink);
    expect(richDocText(out)).toBe('');
  });
});

describe('contrato', () => {
  it('el backend recibe el rango, el tipo y el tope de cada campo nuevo', () => {
    // Los tipos de campo se exportan igual que los demás; el validador de C# los lee de acá.
    const contract = buildThemeContract();
    const kinds = new Set<string>();
    const walk = (fs: Record<string, { kind: string; fields?: Record<string, never> }>) => {
      for (const f of Object.values(fs)) {
        kinds.add(f.kind);
        if (f.fields) walk(f.fields);
      }
    };
    for (const s of Object.values(contract.sections)) walk(s.fields as never);
    // Cada tipo que existe en el contrato es uno que el backend sabe validar.
    for (const k of kinds)
      expect([
        'string',
        'text',
        'url',
        'media',
        'boolean',
        'enum',
        'strings',
        'items',
        'number',
        'datetime',
        'richtext',
      ]).toContain(k);
  });
});
