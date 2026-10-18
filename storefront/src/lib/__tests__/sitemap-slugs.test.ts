import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * El sitemap tiene que listar TODO el catálogo activo. Antes pedía una sola
 * página de cien: CKING tiene casi tres mil productos publicados y Google
 * veía los primeros cien.
 */

const apiGetTenant = vi.hoisted(() => vi.fn());
vi.mock('../api', () => ({ apiGetTenant }));

const pagina = (desde: number, n: number, hayMas: boolean) => ({
  items: Array.from({ length: n }, (_, i) => ({ slug: `p-${desde + i}` })),
  nextCursor: hayMas ? `cursor-${desde + n}` : null,
  hasMore: hayMas,
});

beforeEach(() => apiGetTenant.mockReset());

/** Los slugs que junta el sitemap (el lastmod acá no importa). */
async function fetchAllActiveSlugs(tenantId: string, max?: number): Promise<string[]> {
  const { fetchAllActiveEntries } = await import('../catalog');
  return (await fetchAllActiveEntries(tenantId, max)).map((e) => e.slug);
}

describe('fetchAllActiveEntries', () => {
  it('recorre el cursor hasta el final, no solo la primera página', async () => {
    apiGetTenant
      .mockResolvedValueOnce(pagina(0, 100, true))
      .mockResolvedValueOnce(pagina(100, 100, true))
      .mockResolvedValueOnce(pagina(200, 37, false));

    const slugs = await fetchAllActiveSlugs('t1');

    expect(slugs).toHaveLength(237);
    expect(slugs[0]).toBe('p-0');
    expect(slugs.at(-1)).toBe('p-236');
    expect(apiGetTenant).toHaveBeenCalledTimes(3);
    // Cada página pide la siguiente con el cursor que devolvió la anterior.
    expect(apiGetTenant.mock.calls[1]![0]).toContain('after=cursor-100');
    expect(apiGetTenant.mock.calls[2]![0]).toContain('after=cursor-200');
  });

  it('cada página queda en la Data Cache una hora (no se recorre todo en cada pedido)', async () => {
    apiGetTenant.mockResolvedValueOnce(pagina(0, 3, false));
    await fetchAllActiveSlugs('t1');
    // Con la etiqueta del catálogo: un cambio de productos la vence antes.
    expect(apiGetTenant.mock.calls[0]![2]).toEqual({ next: { revalidate: 3600, tags: ['catalog:t1'] } });
  });

  it('no repite un producto que aparece en dos páginas', async () => {
    apiGetTenant.mockResolvedValueOnce(pagina(0, 3, true)).mockResolvedValueOnce(pagina(2, 3, false));
    expect(await fetchAllActiveSlugs('t1')).toEqual(['p-0', 'p-1', 'p-2', 'p-3', 'p-4']);
  });

  it('un cursor que se repite no lo deja dando vueltas', async () => {
    apiGetTenant.mockResolvedValue(pagina(0, 3, true));
    expect(await fetchAllActiveSlugs('t1')).toHaveLength(3);
    expect(apiGetTenant).toHaveBeenCalledTimes(2);
  });

  it('respeta el tope del sitemap', async () => {
    let desde = 0;
    apiGetTenant.mockImplementation(async () => {
      const p = pagina(desde, 100, true);
      desde += 100;
      return p;
    });
    const slugs = await fetchAllActiveSlugs('t1', 250);
    expect(slugs).toHaveLength(250);
    expect(apiGetTenant).toHaveBeenCalledTimes(3);
  });

  it('si una página falla, devuelve lo que juntó', async () => {
    apiGetTenant.mockResolvedValueOnce(pagina(0, 100, true)).mockRejectedValueOnce(new Error('503'));
    expect(await fetchAllActiveSlugs('t1')).toHaveLength(100);
  });

  it('una tienda sin productos da un sitemap sin productos', async () => {
    apiGetTenant.mockResolvedValueOnce(pagina(0, 0, false));
    expect(await fetchAllActiveSlugs('t1')).toEqual([]);
  });
});
