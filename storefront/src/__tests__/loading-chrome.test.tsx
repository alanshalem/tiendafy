/**
 * Mientras llega lo lento de una página (el catálogo, la ficha de un producto,
 * una página de contenido), la tienda ya muestra su encabezado y su pie, con
 * el esqueleto ADENTRO.
 *
 * Antes el esqueleto de /productos y de la ficha era un loading.tsx, que en
 * Next reemplaza la página entera: el visitante veía una grilla gris sobre
 * blanco, sin la marca ni el menú, hasta que llegaba todo.
 *
 * Acá lo lento queda colgado para siempre y solo responde lo que necesita el
 * marco de la tienda (la tienda, su diseño y el catálogo inicial). Si una
 * página espera algo más antes de devolver su marco, el test se cuelga y falla
 * por tiempo; si lo devuelve, se mira el primer pintado.
 */
import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '../test/api';
import { PAGES } from '../test/pages';
import { renderPending } from '../test/server';

/**
 * Lo que el marco de la tienda (encabezado, pie, carrito) necesita del server.
 * Más la ficha del producto o de la página por slug: si no existe, la
 * respuesta tiene que ser un 404, y eso se decide antes de mandar el marco
 * (después el status ya salió). Llega de la Data Cache casi siempre.
 */
const CHROME = [
  /^\/api\/v1\/tenants\/resolve$/,
  /^\/api\/v1\/theme(\/|$)/,
  // Lo que la tienda anuncia (descuento, cuotas, envío gratis) viaja con el
  // diseño: misma Data Cache y mismo tiempo de vida (ver lib/theme).
  /^\/api\/v1\/store-offers$/,
  /^\/api\/v1\/products$/,
  /^\/api\/v1\/(products|pages)\/by-slug\//,
];

/** El home y el preview del editor SON el marco con sus secciones: no tienen parte lenta aparte. */
const WHOLE_PAGE = new Set(['/', '/preview']);

function onlyChromeAnswers() {
  const api = mockApi();
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const path = new URL(raw, 'http://tienda.test').pathname;
      return CHROME.some((re) => re.test(path)) ? api.fetch(input, init) : new Promise<Response>(() => {}); // lo lento no llega nunca
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('el primer pintado de cada página', () => {
  const pages = Object.entries(PAGES).filter(([name]) => !WHOLE_PAGE.has(name));

  it.each(pages)(
    '%s: encabezado y pie, con el esqueleto adentro',
    { timeout: 30_000 },
    async (_, { url, params, load }) => {
      onlyChromeAnswers();
      const page = (await load()).default;
      await renderPending(page as never, url, params);

      const header = screen.getByRole('banner');
      const footer = screen.getByRole('contentinfo');
      const loading = screen.getByRole('status', { name: /cargando/i });

      // El esqueleto va entre el encabezado y el pie, no en su lugar.
      expect(header.compareDocumentPosition(loading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(loading.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    },
  );

  it('no queda ningún loading.tsx: reemplazan la página entera, marco incluido', async () => {
    const files = import.meta.glob('../app/**/loading.tsx');
    expect(Object.keys(files)).toEqual([]);
  });
});
