/**
 * El registro compartido de secciones (shared/types/src/sections): el
 * normalizador tolerante, las migraciones del tema, las plantillas y los
 * links seguros. Corre acá porque la cobertura del admin incluye
 * shared/types.
 *
 * Lo central: NADA que venga de la base, de un postMessage o de un JSON viejo
 * puede tirar la portada. Antes un `null` en la lista de secciones, un
 * `data: null` o un banner `null` la rompían entera.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SECTIONS,
  HOME_TEMPLATES,
  MAX_SECTIONS,
  SECTION_DEFINITIONS,
  SECTION_GROUPS,
  SECTION_REGISTRY,
  SECTION_TYPES,
  THEME_MIGRATIONS,
  THEME_SCHEMA_VERSION,
  canAddSection,
  createSection,
  isRgbTriplet,
  isSafeLink,
  isSafeMedia,
  migrateTheme,
  normalizeFields,
  normalizeSection,
  normalizeSectionStyle,
  normalizeSections,
  normalizeTheme,
  sectionData,
  sectionDefinition,
  sectionDisplayName,
  templateSections,
  type ThemeMigration,
  type ThemeSection,
} from '@tiendafy/types';

/** Generador pseudoaleatorio con semilla: el mismo "basura" en cada corrida. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

/** Un valor JSON-ish cualquiera, con preferencia por las formas que rompían. */
function garbage(next: () => number, depth = 0): unknown {
  const pick = Math.floor(next() * 12);
  const keys = [
    'type',
    'data',
    'items',
    'banners',
    'images',
    'title',
    'visible',
    'id',
    'style',
    'label',
    'link',
  ];
  switch (pick) {
    case 0:
      return null;
    case 1:
      return undefined;
    case 2:
      return Math.floor(next() * 100) - 50;
    case 3:
      return next() > 0.5;
    case 4:
      return ['faq', 'hero-video', 'promo-banners', 'javascript:alert(1)', '', 'carousel'][
        Math.floor(next() * 6)
      ];
    case 5:
    case 6:
      if (depth > 3) return 'x';
      return Array.from({ length: Math.floor(next() * 4) }, () => garbage(next, depth + 1));
    case 7:
      return {
        type: SECTION_TYPES[Math.floor(next() * SECTION_TYPES.length)],
        data: garbage(next, depth + 1),
      };
    default: {
      if (depth > 3) return {};
      const obj: Record<string, unknown> = {};
      for (let i = 0; i < 1 + Math.floor(next() * 4); i++)
        obj[keys[Math.floor(next() * keys.length)]!] = garbage(next, depth + 1);
      return obj;
    }
  }
}

describe('registro de secciones', () => {
  it('cada tipo tiene su entrada completa', () => {
    expect(Object.keys(SECTION_REGISTRY).sort()).toEqual([...SECTION_TYPES].sort());
    for (const def of SECTION_DEFINITIONS) {
      expect(SECTION_REGISTRY[def.type]).toBe(def);
      expect(def.label.length).toBeGreaterThan(3);
      expect(def.previewLabel).toMatch(/^(el|la|los|las) /);
      expect(def.description.length).toBeGreaterThan(10);
      expect(SECTION_GROUPS).toContain(def.group);
      expect(def.keywords.length).toBeGreaterThan(3);
    }
    // Todos los grupos tienen algo (si no, el menú de agregar muestra un título vacío).
    for (const group of SECTION_GROUPS) expect(SECTION_DEFINITIONS.some((d) => d.group === group)).toBe(true);
    expect(sectionDefinition('no-existe')).toBeUndefined();
  });

  it('el contenido de ejemplo es válido para su propio esquema', () => {
    for (const def of SECTION_DEFINITIONS) {
      const data = normalizeFields(def.fields, def.defaults);
      expect(data).toMatchObject(JSON.parse(JSON.stringify(def.defaults)));
      // Normalizar lo normalizado no cambia nada.
      expect(normalizeFields(def.fields, data)).toEqual(data);
    }
  });

  it('una sección nueva nace visible, con id propio y contenido de ejemplo', () => {
    const a = createSection('faq');
    const b = createSection('faq');
    expect(a.id).not.toBe(b.id);
    expect(a.visible).toBe(true);
    expect(sectionData(a as ThemeSection & { type: 'faq' }).items.length).toBeGreaterThan(0);
    // Las copias no comparten referencias con el registro (editar una no cambia las otras).
    (a.data.items as { question: string }[])[0]!.question = 'cambiada';
    expect((createSection('faq').data.items as { question: string }[])[0]!.question).not.toBe('cambiada');
    // Lo que se pasa manda sobre el ejemplo.
    expect(createSection('institutional', { title: 'Hola' }).data.title).toBe('Hola');
  });

  it('las plantillas arman secciones que se ven (no vacías)', () => {
    for (const tpl of HOME_TEMPLATES) {
      const sections = templateSections(tpl);
      expect(sections.map((s) => s.type)).toEqual([...tpl.sections]);
      for (const s of sections) {
        const def = SECTION_REGISTRY[s.type];
        // Lo que el ejemplo trae, la sección lo tiene.
        expect(s.data).toMatchObject(JSON.parse(JSON.stringify(def.defaults)));
      }
    }
    const lanzamiento = templateSections(HOME_TEMPLATES[0]!);
    expect((lanzamiento[0]!.data as { title: string }).title).not.toBe('');
  });

  it('tope por página: un solo hero, un solo newsletter', () => {
    expect(canAddSection([], 'hero-video')).toBe(true);
    expect(canAddSection([{ type: 'hero-video' }], 'hero-video')).toBe(false);
    expect(canAddSection([{ type: 'newsletter' }], 'newsletter')).toBe(false);
    expect(canAddSection([{ type: 'faq' }, { type: 'faq' }], 'faq')).toBe(true);
    expect(MAX_SECTIONS).toBe(40);
  });

  it('el nombre propio de la sección manda sobre el del tipo', () => {
    expect(sectionDisplayName({ type: 'faq' })).toBe('Preguntas frecuentes');
    expect(sectionDisplayName({ type: 'faq', name: '  Dudas de envío ' })).toBe('Dudas de envío');
    expect(sectionDisplayName({ type: 'faq', name: '   ' })).toBe('Preguntas frecuentes');
    expect(sectionDisplayName({ type: 'otra' as never })).toBe('otra');
  });
});

describe('normalizar secciones', () => {
  it('nada de lo que venga tira, y lo que sale tiene la forma de siempre', () => {
    const next = rng(42);
    for (let i = 0; i < 1500; i++) {
      const raw = garbage(next);
      expect(() => normalizeSections(raw)).not.toThrow();
      expect(() => normalizeSection(raw)).not.toThrow();
      expect(() => normalizeTheme({ sections: raw } as never)).not.toThrow();
      const list = normalizeSections(Array.isArray(raw) ? raw : [raw]) ?? [];
      for (const s of list) {
        expect(typeof s.id).toBe('string');
        expect(typeof s.type).toBe('string');
        expect(typeof s.visible).toBe('boolean');
        expect(typeof s.data).toBe('object');
        expect(s.data).not.toBeNull();
        // Ninguna lista del esquema trae nulls (lo que el esquema no conoce se conserva tal cual).
        const fields = sectionDefinition(s.type)?.fields ?? {};
        for (const [k, v] of Object.entries(s.data))
          if (k in fields && Array.isArray(v)) for (const item of v) expect(item).not.toBeNull();
      }
    }
  });

  it('lo que rompía la portada se limpia', () => {
    const list = normalizeSections([
      null,
      'texto',
      { type: 'faq', id: 'f', visible: true, data: null },
      {
        type: 'promo-banners',
        id: 'p',
        visible: true,
        data: { banners: [null, 3, { title: 'Ok', show: 'no' }] },
      },
      {
        type: 'carousel',
        id: 'c',
        visible: true,
        data: { images: [null, '', 'https://x/a.jpg', 'javascript:x'] },
      },
      { id: 'sin-tipo', data: {} },
    ])!;
    expect(list.map((s) => s.id)).toEqual(['f', 'p', 'c']);
    expect(list[0]!.data).toEqual({ title: '', items: [] });
    expect(list[1]!.data.banners).toEqual([
      { image: '', title: 'Ok', description: '', link: '', show: true },
    ]);
    expect(list[2]!.data.images).toEqual(['https://x/a.jpg']);
  });

  it('respeta lo que no conoce (no borra campos de una versión más nueva)', () => {
    const s = normalizeSection({
      id: 'x',
      type: 'faq',
      visible: true,
      futuro: 1,
      data: { title: 'T', layout: 'dos-columnas', items: [{ question: 'q', answer: 'a', icono: '?' }] },
    })!;
    expect((s as unknown as { futuro: number }).futuro).toBe(1);
    expect(s.data.layout).toBe('dos-columnas');
    expect((s.data.items as { icono: string }[])[0]!.icono).toBe('?');
    // Un tipo desconocido se conserva con su data (el storefront no lo dibuja).
    expect(normalizeSection({ id: 'n', type: 'video-360', visible: true, data: { a: 1 } })!.data).toEqual({
      a: 1,
    });
    expect(normalizeSection({ id: 'n', type: 'video-360', data: 'x' })!.data).toEqual({});
  });

  it('los campos con tipo equivocado caen a su valor de siempre', () => {
    const data = normalizeSection({
      id: 'h',
      type: 'hero-video',
      data: {
        title: 5,
        align: 'diagonal',
        height: null,
        link: 'javascript:alert(1)',
        poster: 'data:image/png;base64,x',
      },
    })!.data;
    expect(data).toMatchObject({ title: '5', align: 'center', height: 'large', link: '', poster: '' });
    // Destacados sin título: el de siempre ("Destacados"); con título vacío, vacío (sin título).
    expect(normalizeSection({ id: 'd', type: 'featured', data: {} })!.data.title).toBe('Destacados');
    expect(normalizeSection({ id: 'd', type: 'featured', data: { title: '' } })!.data.title).toBe('');
  });

  it('el sobre: visible solo si es true, nombre, dispositivos y estilo saneados', () => {
    const s = normalizeSection({
      id: 'a',
      type: 'institutional',
      visible: 'true',
      name: 'Mi bloque',
      hideOn: 'tablet',
      style: { background: 'custom', backgroundColor: '300 0 0', paddingTop: 'lg', align: 'right', x: 1 },
      data: {},
    })!;
    expect(s.visible).toBe(false);
    expect(s.name).toBe('Mi bloque');
    expect(s.hideOn).toBeUndefined();
    expect(s.style).toEqual({ background: 'custom', paddingTop: 'lg' });
    expect(
      normalizeSection({ id: 'b', type: 'faq', name: '  ', hideOn: 'mobile', style: {}, data: {} }),
    ).toEqual({
      id: 'b',
      type: 'faq',
      visible: false,
      hideOn: 'mobile',
      data: { title: '', items: [] },
    });
    expect(normalizeSectionStyle('x')).toBeUndefined();
    expect(isRgbTriplet('10 20 30')).toBe(true);
    expect(isRgbTriplet('10 20')).toBe(false);
  });

  it('ids repetidos o faltantes se arreglan (abrir una no abre la otra)', () => {
    const list = normalizeSections([
      { id: 'a', type: 'faq', data: {} },
      { id: 'a', type: 'faq', data: {} },
      { type: 'faq', data: {} },
      { id: 'x'.repeat(200), type: 'faq', data: {} },
    ])!;
    expect(new Set(list.map((s) => s.id)).size).toBe(4);
    expect(list[1]!.id).toBe('a-2');
    expect(list[2]!.id).toBe('faq-2');
  });

  it('las ítems conservan su nombre propio y descartan uno vacío', () => {
    const data = normalizeSection({
      id: 'f',
      type: 'faq',
      data: {
        items: [{ question: 'q', answer: 'a', label: 'Envíos' }, { question: 'q', label: ' ' }, { label: 4 }],
      },
    })!.data.items as { label?: string }[];
    expect(data.map((i) => i.label)).toEqual(['Envíos', undefined, undefined]);
    expect('label' in data[1]!).toBe(false);
  });
});

describe('inicio vacío vs. nunca configurado', () => {
  it('una lista vacía es un inicio vacío a propósito', () => {
    expect(normalizeTheme({ sections: [] }).sections).toEqual([]);
  });

  it('sin lista (nunca se configuró) van las secciones iniciales', () => {
    expect(normalizeTheme({}).sections).toEqual(DEFAULT_SECTIONS);
    expect(normalizeTheme(null).sections).toEqual(DEFAULT_SECTIONS);
    expect(normalizeTheme({ sections: 'x' } as never).sections).toEqual(DEFAULT_SECTIONS);
    expect(normalizeTheme({}, []).sections).toEqual([]);
  });
});

describe('migraciones del tema', () => {
  it('un tema de antes del esquema (v0) llega a la versión actual', () => {
    const migrated = migrateTheme({ sections: [null, { id: 'a', type: 'faq', data: null }] });
    expect(migrated.schemaVersion).toBe(THEME_SCHEMA_VERSION);
    expect(migrated.sections).toEqual([{ id: 'a', type: 'faq', data: {} }]);
    expect(normalizeTheme({ sections: [] }).schemaVersion).toBe(THEME_SCHEMA_VERSION);
    expect(THEME_MIGRATIONS[0]!.from).toBe(0);
  });

  it('nunca tira, aunque el tema sea cualquier cosa', () => {
    const next = rng(7);
    for (let i = 0; i < 500; i++) {
      const raw = garbage(next);
      expect(() => migrateTheme(raw)).not.toThrow();
      expect(() => normalizeTheme(raw as never)).not.toThrow();
    }
    expect(migrateTheme('x').schemaVersion).toBe(THEME_SCHEMA_VERSION);
    expect(migrateTheme({ schemaVersion: -3, sections: 'x' }).schemaVersion).toBe(THEME_SCHEMA_VERSION);
  });

  it('agregar una migración es sumar una entrada (y corre una sola vez)', () => {
    // El ejemplo de la fase siguiente: las imágenes del carrusel pasan a ser diapositivas.
    const slides: ThemeMigration = {
      from: 1,
      to: 2,
      description: 'carrusel: images: string[] → slides',
      migrate: (t) => ({
        ...t,
        sections: (t.sections as ThemeSection[]).map((s) =>
          s.type === 'carousel'
            ? { ...s, data: { slides: (s.data.images as string[]).map((image) => ({ image })) } }
            : s,
        ),
      }),
    };
    const v1 = { schemaVersion: 1, sections: [{ id: 'c', type: 'carousel', data: { images: ['a.jpg'] } }] };
    const v2 = migrateTheme(v1, [...THEME_MIGRATIONS, slides]);
    expect(v2.schemaVersion).toBe(2);
    expect((v2.sections as ThemeSection[])[0]!.data).toEqual({ slides: [{ image: 'a.jpg' }] });
    // Ya migrado: no se vuelve a aplicar.
    expect(migrateTheme(v2, [...THEME_MIGRATIONS, slides])).toEqual(v2);
    // Una versión más nueva que la que conoce este código se respeta (no se "baja").
    expect(migrateTheme(v2).schemaVersion).toBe(2);
  });

  it('si una migración falla, se corta ahí sin marcar la versión nueva', () => {
    const broken: ThemeMigration = {
      from: 1,
      to: 2,
      description: 'rota',
      migrate: () => {
        throw new Error('dato imposible');
      },
    };
    const bug: ThemeMigration = {
      from: 1,
      to: 2,
      description: 'devuelve basura',
      migrate: () => null as never,
    };
    const v1 = { schemaVersion: 1, sections: [] };
    expect(migrateTheme(v1, [...THEME_MIGRATIONS, broken])).toEqual(v1);
    expect(migrateTheme(v1, [...THEME_MIGRATIONS, bug])).toEqual(v1);
  });
});

describe('links seguros', () => {
  it.each([
    ['/productos', true],
    ['#contacto', true],
    ['productos?x=1', true],
    ['https://wa.me/549110000', true],
    ['mailto:hola@x.com', true],
    ['tel:+5411', true],
    ['javascript:alert(1)', false],
    [' JaVa\tScRiPt:alert(1)', false],
    ['data:text/html,x', false],
    ['vbscript:x', false],
    [`https://x.com/${'a'.repeat(2001)}`, false],
  ])('%s → %s', (link, ok) => {
    expect(isSafeLink(link)).toBe(ok);
  });

  it('imágenes: http(s) o rutas, nada de data: ni mailto:', () => {
    expect(isSafeMedia('/marca/logo.svg')).toBe(true);
    expect(isSafeMedia('https://cdn.x/a.png')).toBe(true);
    expect(isSafeMedia('data:image/png;base64,x')).toBe(false);
    expect(isSafeMedia('mailto:x')).toBe(false);
  });
});
