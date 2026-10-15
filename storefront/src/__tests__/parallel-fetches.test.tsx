/**
 * Los pedidos del servidor que no dependen uno del otro salen a la par: el
 * tiempo hasta el primer byte es el del más lento, no la suma de todos.
 *
 * Cómo se prueba: los pedidos de interés quedan retenidos (una promesa que
 * todavía no se resolvió) y se espera a que TODOS hayan arrancado antes de
 * soltar alguno. Si el código los encadenara, el segundo nunca saldría
 * mientras el primero sigue colgado y la espera vence.
 */
import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProductDetailPage from '../app/productos/[slug]/page';
import { resolveStorefrontPage } from '../lib/storefront-page';
import { fixture, mockApi, normalize, type MockApi } from '../test/api';
import { renderPage } from '../test/server';

let api: MockApi;
let release: () => void = () => {};

/**
 * Retiene los pedidos a estas rutas (normalizadas: ver test/api) hasta
 * `release()`. Devuelve las rutas que ya arrancaron, en orden.
 */
function hold(paths: string[]): string[] {
  const gate = Promise.withResolvers<void>();
  release = () => gate.resolve();
  const started: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const path = normalize(new URL(url, 'http://localhost').pathname);
      if (paths.includes(path)) {
        started.push(path);
        await gate.promise;
      }
      return api.fetch(input, init);
    }),
  );
  return started;
}

beforeEach(() => {
  api = mockApi();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  release(); // que nada quede colgado si un test falló a mitad de camino
  vi.restoreAllMocks();
});

describe('pedidos a la par', () => {
  it('la página interna pide el catálogo y el diseño juntos, apenas sabe la tienda', async () => {
    const started = hold(['/api/v1/products', '/api/v1/theme']);
    const page = resolveStorefrontPage(Promise.resolve({}));

    await vi.waitFor(() => expect([...started].sort()).toEqual(['/api/v1/products', '/api/v1/theme']));
    release();

    const resolved = await page;
    expect(resolved.ok).toBe(true);
    if (resolved.ok) expect(resolved.data.products.length).toBeGreaterThan(0);
  });

  it('la ficha pide relacionados, ficha técnica, categorías y opiniones juntos', async () => {
    const product = fixture<{ slug: string; name: string }>('/api/v1/products/by-slug/x');
    api.on('GET', `/api/v1/products/by-slug/${product.slug}`, {
      ...product,
      categoryIds: ['c-leaf'],
      specs: [{ definitionId: 'd-mat', value: 'Hierro' }],
    });
    api.on('GET', '/api/v1/categories', {
      items: [{ id: 'c-leaf', name: 'Pesas', parentId: null }],
    });
    api.on('GET', '/api/v1/spec-definitions', {
      items: [{ id: 'd-mat', name: 'Material', unit: null, showOnProduct: true, sortOrder: 1 }],
    });

    const HELD = [
      '/api/v1/categories',
      '/api/v1/products/search',
      '/api/v1/reviews/products/:id',
      '/api/v1/spec-definitions',
    ];
    const started = hold(HELD);
    const page = renderPage(ProductDetailPage, `/productos/${product.slug}`, { slug: product.slug });

    await vi.waitFor(() => expect([...new Set(started)].sort()).toEqual(HELD));
    release();
    await page;

    // Y lo que llegó a la par se arma igual que antes.
    expect(screen.getByRole('link', { name: 'Pesas' })).toBeInTheDocument();
    expect(screen.getByText('Material')).toBeInTheDocument();
  });
});
