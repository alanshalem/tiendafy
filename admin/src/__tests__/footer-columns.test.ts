/**
 * Columnas del pie: un tema guardado antes de que existieran arma las
 * equivalentes (y la tienda se ve igual que siempre), lo guardado se limpia
 * sin perder lo que el comercio armó, y los estilos rápidos agregan o quitan
 * columnas sin tocar lo demás.
 */
import { describe, expect, it } from 'vitest';
import {
  baseTheme,
  deriveFooterColumns,
  FOOTER_COLUMNS_MAX,
  footerColumnTitle,
  normalizeTheme,
  type FooterColumn,
  type ThemeConfig,
} from '@tiendafy/types';
import { toggleColumnKind } from '../pages/theme-editor-footer-columns';

type Footer = ThemeConfig['footer'];
/** Un pie guardado antes de las columnas (sin `columns`). */
const old = (footer: Partial<Footer>) => normalizeTheme({ footer: footer as Footer }).footer;
const kinds = (columns: FooterColumn[]) => columns.map((c) => c.kind);

describe('un pie de antes de las columnas', () => {
  it('centrado, sin nada prendido: marca y contacto (lo que dibujaba igual)', () => {
    const f = old({ text: 'Hola' });
    expect(f.columns).toEqual([
      { id: 'brand', kind: 'social' },
      { id: 'contact', kind: 'contact' },
    ]);
    // Los defaults de fábrica son lo mismo que se arma para ellos.
    expect(normalizeTheme(null).footer.columns).toEqual(deriveFooterColumns(baseTheme.footer));
  });

  it('los links viejos pasan a una columna "Información" con los mismos links', () => {
    const links = [
      { label: 'Envíos', href: '/paginas/envios' },
      { label: 'Catálogo', href: 'https://x.com/a.pdf', newTab: true },
    ];
    const f = old({ layout: 'columns', links });
    const col = f.columns.find((c) => c.kind === 'links')!;
    expect(col.links).toEqual(links);
    expect(col.withPages).toBeUndefined();
    expect(footerColumnTitle(col, f)).toBe('Información');
    // Los viejos siguen ahí: se leen, no se borran.
    expect(f.links).toEqual(links);
  });

  it('showPages: con links, las páginas se suman a la misma columna; sin links, una columna de páginas', () => {
    const both = old({ layout: 'columns', showPages: true, links: [{ label: 'A', href: '/a' }] });
    expect(kinds(both.columns)).toEqual(['social', 'links', 'contact']);
    expect(both.columns[1]!.withPages).toBe(true);
    expect(both.showPages).toBe(true);

    const pagesOnly = old({ layout: 'columns', showPages: true });
    expect(kinds(pagesOnly.columns)).toEqual(['social', 'pages', 'contact']);
    expect(footerColumnTitle(pagesOnly.columns[1]!, pagesOnly)).toBe('Información');
  });

  it('novedades prendida: al final en columnas, antes del contacto en centrado (como se apilaba)', () => {
    expect(kinds(old({ layout: 'columns', showNewsletter: true }).columns)).toEqual([
      'social',
      'contact',
      'newsletter',
    ]);
    expect(kinds(old({ layout: 'centered', showNewsletter: true }).columns)).toEqual([
      'social',
      'newsletter',
      'contact',
    ]);
    const off = old({ layout: 'columns', showNewsletter: false });
    expect(kinds(off.columns)).not.toContain('newsletter');
    expect(off.showNewsletter).toBe(false);
  });

  it('el título de novedades es el de siempre (newsletterTitle)', () => {
    const f = old({ showNewsletter: true, newsletterTitle: 'Sumate' });
    const news = f.columns.find((c) => c.kind === 'newsletter')!;
    expect(footerColumnTitle(news, f)).toBe('Sumate');
    expect(footerColumnTitle(news, { newsletterTitle: '' })).toBe('Recibí novedades');
  });
});

describe('columnas guardadas', () => {
  it('se respetan en su orden y los booleanos salen de ellas', () => {
    const columns: FooterColumn[] = [
      { id: 'n', kind: 'newsletter' },
      { id: 'ayuda', kind: 'links', title: 'Ayuda', links: [{ label: 'FAQ', href: '/faq' }] },
    ];
    // showPages/showNewsletter guardados mienten: mandan las columnas.
    const f = normalizeTheme({
      footer: { columns, showPages: true, showNewsletter: false } as unknown as Footer,
    }).footer;
    expect(f.columns).toEqual(columns);
    expect(f.showNewsletter).toBe(true);
    expect(f.showPages).toBe(false);
  });

  it('una lista vacía es un pie sin columnas a propósito', () => {
    expect(normalizeTheme({ footer: { columns: [] } as unknown as Footer }).footer.columns).toEqual([]);
  });

  it('descarta lo roto, los repetidos que van una sola vez, ids repetidos y lo que pasa del tope', () => {
    const raw = [
      null,
      { id: 'x', kind: 'mapa' },
      { id: 'c', kind: 'contact' },
      { id: 'c2', kind: 'contact' },
      { id: 't', kind: 'text', text: 'a'.repeat(5000), title: 'b'.repeat(500) },
      { id: 't', kind: 'text', text: 'Otra' },
      { kind: 'links', links: [{ label: 'ok', href: '/ok' }, { label: 1 }, null], withPages: 'sí' },
      { id: 's', kind: 'social', hideBrand: true },
      { id: 'p', kind: 'pages' },
      { id: 'n', kind: 'newsletter' },
    ];
    const f = normalizeTheme({ footer: { columns: raw } as unknown as Footer }).footer;
    expect(f.columns).toHaveLength(FOOTER_COLUMNS_MAX);
    expect(kinds(f.columns)).toEqual(['contact', 'text', 'text', 'links', 'social']);
    expect(new Set(f.columns.map((c) => c.id)).size).toBe(f.columns.length);
    expect(f.columns[1]!.text).toHaveLength(600);
    expect(f.columns[1]!.title).toHaveLength(60);
    expect(f.columns[3]).toEqual({ id: 'links', kind: 'links', links: [{ label: 'ok', href: '/ok' }] });
    expect(f.columns[4]!.hideBrand).toBe(true);
  });
});

describe('estilos rápidos sobre las columnas', () => {
  const mine: FooterColumn[] = [
    { id: 'brand', kind: 'social' },
    { id: 'ayuda', kind: 'links', title: 'Ayuda', links: [], withPages: true },
    { id: 'nos', kind: 'text', text: 'Somos' },
  ];

  it('prender páginas no duplica si una columna de links ya las suma; apagarlas las saca de ahí', () => {
    expect(toggleColumnKind(mine, 'pages', true)).toBe(mine);
    const off = toggleColumnKind(mine, 'pages', false);
    expect(off[1]).toEqual({ id: 'ayuda', kind: 'links', title: 'Ayuda', links: [] });
    // Prender de nuevo: una columna de páginas después de la marca y los links.
    expect(kinds(toggleColumnKind(off, 'pages', true))).toEqual(['social', 'links', 'pages', 'text']);
  });

  it('novedades va al final y respeta el tope', () => {
    expect(kinds(toggleColumnKind(mine, 'newsletter', true))).toEqual([
      'social',
      'links',
      'text',
      'newsletter',
    ]);
    const full = Array.from({ length: FOOTER_COLUMNS_MAX }, (_, i): FooterColumn => ({
      id: `t${i}`,
      kind: 'text',
    }));
    expect(toggleColumnKind(full, 'newsletter', true)).toBe(full);
  });
});
