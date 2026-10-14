import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Lo que la tienda le pide a la API en cada vista de página, y cuánto lo
 * guarda. Antes la tienda y el diseño se pedían sin caché en cada vista, y
 * el checkout traía 24 productos que no mostraba.
 *
 * La regla que no se puede romper: la Data Cache de Next guarda por URL e
 * IGNORA los headers, así que todo lo cacheado lleva la tienda en la URL.
 */

const apiGet = vi.hoisted(() => vi.fn());
const apiGetTenant = vi.hoisted(() => vi.fn());
vi.mock('../api', () => ({ apiGet, apiGetTenant }));
vi.mock('next/headers', () => ({
  headers: async () => ({ get: (n: string) => (n.toLowerCase() === 'host' ? 'una.localhost:3000' : null) }),
}));

beforeEach(() => {
  vi.resetModules();
  apiGet.mockReset();
  apiGetTenant.mockReset();
});

describe('qué tienda es (por host)', () => {
  it('se cachea un minuto, con el host en la URL', async () => {
    apiGet.mockResolvedValue({ id: 't1', name: 'Una', status: 'ACTIVE' });
    const { resolveTenant } = await import('../tenancy');
    await resolveTenant();
    const [url, init] = apiGet.mock.calls[0] as [string, RequestInit & { next?: { revalidate?: number } }];
    expect(url).toContain('host=una.localhost%3A3000');
    expect(init.next?.revalidate).toBe(60);
    expect(init.cache).toBeUndefined();
    // El backend la vence al toque cuando cambia el estado de una tienda.
    expect((init.next as { tags?: string[] }).tags).toEqual(['tenants']);
  });
});

describe('el diseño', () => {
  it('el publicado se cachea poco (después de publicar, el comercio quiere verlo)', async () => {
    apiGetTenant.mockResolvedValue(null);
    const { fetchPublishedTheme } = await import('../theme');
    await fetchPublishedTheme('t1');
    const [path, tenantId, init] = apiGetTenant.mock.calls[0] as [
      string,
      string,
      { next?: { revalidate?: number } },
    ];
    expect(path).toBe('/api/v1/theme');
    expect(tenantId).toBe('t1'); // apiGetTenant: la tienda va en la URL
    expect(init.next?.revalidate).toBe(30);
    // Al publicar, el backend vence esta etiqueta y el cambio se ve al instante.
    expect((init.next as { tags?: string[] }).tags).toEqual(['theme:t1']);
  });

  it('el borrador del editor nunca sale de la caché', async () => {
    apiGetTenant.mockResolvedValue({});
    const { fetchDraftTheme } = await import('../theme');
    await fetchDraftTheme('t1', 'pt');
    const [path, , init] = apiGetTenant.mock.calls[0] as [string, string, RequestInit];
    expect(path).toBe('/api/v1/theme/draft');
    expect(init.cache).toBe('no-store');
  });
});

describe('loadStorefront', () => {
  const tienda = { id: 't1', name: 'Una', status: 'ACTIVE' };

  it('trae los primeros productos para las páginas que los muestran', async () => {
    apiGet.mockResolvedValue(tienda);
    apiGetTenant.mockResolvedValue({ items: [], hasMore: false });
    const { loadStorefront } = await import('../storefront');
    expect(await loadStorefront()).toEqual({ tenant: tienda, products: [] });
    expect(apiGetTenant).toHaveBeenCalledTimes(1);
  });

  it('no pide productos si la página no los usa (checkout)', async () => {
    apiGet.mockResolvedValue(tienda);
    const { loadStorefront } = await import('../storefront');
    expect(await loadStorefront({ products: false })).toEqual({ tenant: tienda, products: [] });
    expect(apiGetTenant).not.toHaveBeenCalled();
  });
});
