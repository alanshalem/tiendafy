import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * El sitemap tiene que listar TODO el catálogo activo. Antes pedía una sola
 * página de cien: CKING tiene casi tres mil productos publicados y Google
 * veía los primeros cien.
 */

const apiGetTenant = vi.hoisted(() => vi.fn());
vi.mock('../api', () => ({ apiGetTenant }));
vi.mock('../cache', () => ({ REVALIDATE: { catalog: 30 } }));

const pagina = (desde: number, n: number, hayMas: boolean) => ({
  items: Array.from({ length: n }, (_, i) => ({ slug: `p-${desde + i}` })),
  nextCursor: hayMas ? `cursor-${desde + n}` : null,
  hasMore: hayMas,
});

beforeEach(() => apiGetTenant.mockReset());

describe('fetchAllActiveSlugs', () => {
  it('recorre el cursor hasta el final, no solo la primera página', async () => {
    apiGetTenant
      .mockResolvedValueOnce(pagina(0, 100, true))
      .mockResolvedValueOnce(pagina(100, 100, true))
      .mockResolvedValueOnce(pagina(200, 37, false));

    const { fetchAllActiveSlugs } = await import('../catalog');
    const slugs = await fetchAllActiveSlugs('t1');

    expect(slugs).toHaveLength(237);
    expect(slugs[0]).toBe('p-0');
    expect(slugs.at(-1)).toBe('p-236');
    expect(apiGetTenant).toHaveBeenCalledTimes(3);
    // Cada página pide la siguiente con el cursor que devolvió la anterior.
    expect(apiGetTenant.mock.calls[1]![0]).toContain('after=cursor-100');
    expect(apiGetTenant.mock.calls[2]![0]).toContain('after=cursor-200');
  });

  it('respeta el tope del sitemap', async () => {
    apiGetTenant.mockResolvedValue(pagina(0, 100, true));
    const { fetchAllActiveSlugs } = await import('../catalog');
    const slugs = await fetchAllActiveSlugs('t1', 250);
    expect(slugs).toHaveLength(250);
    expect(apiGetTenant).toHaveBeenCalledTimes(3);
  });

  it('si una página falla, devuelve lo que juntó', async () => {
    apiGetTenant.mockResolvedValueOnce(pagina(0, 100, true)).mockRejectedValueOnce(new Error('503'));
    const { fetchAllActiveSlugs } = await import('../catalog');
    expect(await fetchAllActiveSlugs('t1')).toHaveLength(100);
  });

  it('una tienda sin productos da un sitemap sin productos', async () => {
    apiGetTenant.mockResolvedValueOnce(pagina(0, 0, false));
    const { fetchAllActiveSlugs } = await import('../catalog');
    expect(await fetchAllActiveSlugs('t1')).toEqual([]);
  });
});
