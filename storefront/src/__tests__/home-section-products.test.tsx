/**
 * Los productos de las secciones de la portada, de punta a punta: el servidor
 * los pide según el origen de cada sección y llegan al render. Antes salían
 * de los 24 más nuevos: destacados y recién llegados eran lo mismo y ofertas
 * casi siempre quedaba vacía.
 */
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HomePage from '../app/page';
import PreviewPage from '../app/preview/page';
import { StorefrontView } from '../components/store/StorefrontView';
import { useSectionProducts } from '../components/store/SectionProductsContext';
import type { ProductDto } from '../lib/catalog';
import { mergeTheme, type ThemeConfig, type ThemeSection } from '../lib/theme';
import { fixture, fixtureTenantId, mockApi, type MockApi } from '../test/api';
import { renderPage } from '../test/server';

const theme = fixture<ThemeConfig>('/api/v1/theme');
const dto = fixture<ProductDto>('/api/v1/products/by-slug/x');
const SECTION = '/api/v1/products/section';

const sections: ThemeSection[] = [
  { id: 'dest', type: 'featured', visible: true, data: { title: 'Lo que más sale' } },
  { id: 'nuevo', type: 'new-products', visible: true, data: { title: 'Recién llegado', carousel: false } },
  { id: 'ofer', type: 'sale-products', visible: true, data: { title: 'Ofertas de verdad' } },
];

let api: MockApi;

/** La API de secciones según el `kind` pedido (el mock general no mira la query). */
function sectionsByKind(byKind: Record<string, string[]>) {
  const base = vi.mocked(fetch);
  const original = base.getMockImplementation()!;
  base.mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname !== SECTION) return original(input, init);
    api.calls.push({ method: 'GET', path: url.pathname + url.search, body: undefined, headers: {} });
    const names = byKind[url.searchParams.get('kind')!] ?? [];
    const items = names.map((name) => ({ ...dto, id: `id-${name}`, slug: `s-${name}`, name }));
    return new Response(JSON.stringify({ items }), { status: 200 });
  });
}

const grid = (title: string) => screen.getByText(title).closest('section')!;

beforeEach(() => {
  api = mockApi();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('secciones de productos de la portada', () => {
  it('cada sección muestra lo de su origen', async () => {
    api.on('GET', '/api/v1/theme', { ...theme, sections });
    sectionsByKind({ 'best-sellers': ['El más vendido'], newest: ['Lo último'], 'on-sale': ['Rebajado'] });
    await renderPage(HomePage, '/');

    expect(within(grid('Lo que más sale')).getByText('El más vendido')).toBeInTheDocument();
    expect(within(grid('Recién llegado')).getByText('Lo último')).toBeInTheDocument();
    expect(within(grid('Ofertas de verdad')).getByText('Rebajado')).toBeInTheDocument();
    expect(within(grid('Ofertas de verdad')).queryByText('Lo último')).not.toBeInTheDocument();
    // La caché de Next va por URL: la tienda viaja en ella.
    const asked = api.calls.filter((c) => c.path.startsWith(`${SECTION}?`));
    expect(asked).toHaveLength(3);
    expect(asked.every((c) => c.path.includes(`_mt=${fixtureTenantId}`))).toBe(true);
  });

  it('sin ofertas, la sección de ofertas no aparece', async () => {
    api.on('GET', '/api/v1/theme', { ...theme, sections });
    sectionsByKind({ 'best-sellers': ['El más vendido'], newest: ['Lo último'] });
    await renderPage(HomePage, '/');
    expect(screen.queryByText('Ofertas de verdad')).not.toBeInTheDocument();
    expect(screen.getByText('Lo que más sale')).toBeInTheDocument();
  });

  it('una sección vieja (solo productIds) muestra los mismos elegidos, en su orden', async () => {
    const legacy: ThemeSection[] = [
      { id: 'viejo', type: 'featured', visible: true, data: { title: 'Elegidos', productIds: ['b', 'a'] } },
    ];
    api.on('GET', '/api/v1/theme', { ...theme, sections: legacy });
    const base = vi.mocked(fetch);
    const original = base.getMockImplementation()!;
    base.mockImplementation(async (input, init) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname !== SECTION) return original(input, init);
      api.calls.push({ method: 'GET', path: url.pathname + url.search, body: undefined, headers: {} });
      const ids = (url.searchParams.get('ids') ?? '').split(',');
      const items = ids.map((id) => ({ ...dto, id, slug: `s-${id}`, name: `Elegido ${id}` }));
      return new Response(JSON.stringify({ items }), { status: 200 });
    });
    await renderPage(HomePage, '/');

    const asked = api.calls.filter((c) => c.path.startsWith(`${SECTION}?`));
    expect(asked).toHaveLength(1);
    expect(asked[0]!.path).toContain('kind=manual&ids=b%2Ca&limit=2');
    const names = within(grid('Elegidos'))
      .getAllByText(/^Elegido /)
      .map((e) => e.textContent);
    expect(names).toEqual(['Elegido b', 'Elegido a']);
  });

  it('la vista previa del editor arranca con lo resuelto en el servidor', async () => {
    api.on('GET', '/api/v1/theme/draft', { ...theme, sections });
    sectionsByKind({ 'best-sellers': [], newest: ['Lo último'], 'on-sale': ['Rebajado'] });
    await renderPage(PreviewPage, '/preview?pt=tok-firmado');
    // Destacados sin ventas todavía: lo último.
    expect(within(grid('Lo que más sale')).getByText('Lo último')).toBeInTheDocument();
    expect(within(grid('Ofertas de verdad')).getByText('Rebajado')).toBeInTheDocument();
  });
});

describe('useSectionProducts', () => {
  it('le da a cada sección lo suyo, por id', () => {
    const products = [{ ...dto, id: 'a', name: 'Para destacados' }];
    const key = 'kind=best-sellers&limit=8|kind=newest&limit=8';
    function Probe({ id }: { id: string }) {
      const list = useSectionProducts(id);
      return <p>{list ? list.map((p) => p.name).join(',') : `sin datos ${id}`}</p>;
    }
    render(
      <StorefrontView
        tenantId={fixtureTenantId}
        tenantName="Tienda"
        theme={mergeTheme({ ...theme, sections })}
        products={[]}
        sectionProducts={{
          [key]: products.map((p) => ({
            id: p.id,
            name: p.name,
            slug: p.slug,
            priceAmount: 1,
            currency: 'ARS',
            compareAtAmount: null,
            image: null,
            images: [],
            variantId: 'v',
            variantLabel: 'Única',
          })),
        }}
      >
        <Probe id="dest" />
        <Probe id="nuevo" />
      </StorefrontView>,
    );
    expect(screen.getByText('Para destacados')).toBeInTheDocument();
    expect(screen.getByText('sin datos nuevo')).toBeInTheDocument();
  });
});
