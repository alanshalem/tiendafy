/**
 * Todas las páginas de la tienda, renderizadas como las sirve Next (Server
 * Component resuelto + componentes cliente) con los datos REALES de la tienda
 * sembrada: el tema publicado, el catálogo, un producto, una página de
 * contenido. Ninguna puede romperse, y cada una tiene que mostrar lo suyo.
 *
 * Es el smoke del storefront. Las páginas salen del árbol app/: una nueva que
 * no esté acá hace fallar el primer test.
 */
import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '../test/api';
import { contentPage, discoveredPages, firstListed, PAGES, product } from '../test/pages';
import { renderPage } from '../test/server';

/** Lo que cada página tiene que mostrar, además de no romperse. */
const SHOWS: Record<string, RegExp | string> = {
  '/productos': firstListed,
  '/productos/[slug]': product.name,
  '/paginas/[slug]': contentPage.title,
  '/privacidad': /privacidad/i,
  '/terminos': /t[ée]rminos/i,
  '/arrepentimiento': /arrepentimiento/i,
  '/contacto': /contacto/i,
};

let errors: unknown[][] = [];
beforeEach(() => {
  errors = [];
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    errors.push(args);
  });
});
afterEach(() => vi.restoreAllMocks());

describe('páginas de la tienda', () => {
  it('cada página de app/ está en la lista', () => {
    expect(discoveredPages().sort()).toEqual(Object.keys(PAGES).sort());
  });

  it.each(Object.entries(PAGES))('%s', { timeout: 30_000 }, async (_, { url, params, load }) => {
    mockApi();
    const page = (await load()).default;
    await renderPage(page as never, url, params);

    expect(errors.filter((args) => args.some((a) => a instanceof Error))).toEqual([]);
    expect(document.body.textContent?.length ?? 0).toBeGreaterThan(20);
    expect(screen.queryByText('Tienda no encontrada')).not.toBeInTheDocument();
    const name = Object.entries(PAGES).find(([, p]) => p.url === url)![0];
    if (SHOWS[name]) expect(screen.getAllByText(SHOWS[name]!).length).toBeGreaterThan(0);
  });
});
