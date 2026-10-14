/**
 * De dónde salen los productos de las secciones de la portada: el origen de
 * cada una (lo guardado o el default de su tipo), la URL que va a la API (con
 * la tienda, por la caché), el respaldo de destacados y cómo llega a cada
 * sección (por id, vía useSectionProducts).
 */
import {
  normalizeProductSource,
  productSourceQuery,
  productSourceListingHref,
  sectionProductPlan,
  type ThemeSection,
} from '@tiendafy/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreProduct } from '@/components/store/ProductCard';
import { fetchProductsByIdsClient, fetchSectionProductsClient } from '../catalog-client';
import { fetchSectionProducts, type ProductDto } from '../catalog';
import { planKey, productsBySection, resolvePlan, sectionPlans } from '../section-products';
import { loadHomeSectionProducts, loadSectionProducts } from '../storefront';
import { fixture, fixtureTenantId, mockApi, type MockApi } from '../../test/api';

const section = (type: string, data: Record<string, unknown> = {}, id = type): ThemeSection =>
  ({ id, type, visible: true, data }) as ThemeSection;

const card = (id: string, name = id): StoreProduct => ({
  id,
  name,
  slug: id,
  priceAmount: 100,
  currency: 'ARS',
  compareAtAmount: null,
  image: null,
  images: [],
  variantId: `v-${id}`,
  variantLabel: 'Única',
});

describe('origen de una sección', () => {
  it('sin elegir nada: destacados = más vendido (y si no hay ventas, lo último), recién llegados = lo último, ofertas = las ofertas', () => {
    expect(sectionProductPlan(section('featured'))).toEqual({
      source: { kind: 'best-sellers' },
      fallback: { kind: 'newest' },
      limit: 8,
    });
    expect(sectionProductPlan(section('new-products'))).toEqual({ source: { kind: 'newest' }, limit: 8 });
    expect(sectionProductPlan(section('sale-products'))).toEqual({ source: { kind: 'on-sale' }, limit: 8 });
    expect(sectionProductPlan(section('faq'))).toBeNull();
  });

  it('los elegidos de antes (productIds) son una lista a mano y se muestran todos (hasta 24)', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `id-${i}`);
    expect(sectionProductPlan(section('sale-products', { productIds: [...ids, 'id-0', 7, ''] }))).toEqual({
      source: { kind: 'manual', ids },
      limit: 12,
    });
    const many = Array.from({ length: 40 }, (_, i) => `x-${i}`);
    expect(sectionProductPlan(section('featured', { productIds: many }))!.limit).toBe(24);
  });

  it('el origen guardado por el editor manda, con su límite', () => {
    expect(
      sectionProductPlan(
        section('featured', {
          productIds: ['viejo'],
          source: {
            kind: 'category',
            categoryId: ' cat-1 ',
            includeChildren: false,
            sort: 'price_asc',
            otro: 1,
          },
          limit: 30,
        }),
      ),
    ).toEqual({
      source: { kind: 'category', categoryId: 'cat-1', includeChildren: false, sort: 'price_asc' },
      limit: 24,
    });
    // Un origen roto cae a lo de antes.
    expect(
      sectionProductPlan(section('new-products', { source: { kind: 'brand', brand: ' ' } }))!.source,
    ).toEqual({ kind: 'newest' });
    expect(sectionProductPlan(section('new-products', { limit: 0 }))!.limit).toBe(1);
  });

  it('normaliza lo que venga guardado', () => {
    expect(normalizeProductSource(null)).toBeNull();
    expect(normalizeProductSource({ kind: 'otra' })).toBeNull();
    expect(normalizeProductSource({ kind: 'category' })).toBeNull();
    expect(normalizeProductSource({ kind: 'brand', brand: ' Nike ', sort: 'raro' })).toEqual({
      kind: 'brand',
      brand: 'Nike',
    });
    expect(normalizeProductSource({ kind: 'manual', ids: 'a,b' })).toEqual({ kind: 'manual', ids: [] });
    expect(normalizeProductSource({ kind: 'on-sale', sort: 'name' })).toEqual({
      kind: 'on-sale',
      sort: 'name',
    });
    expect(normalizeProductSource({ kind: 'newest', sort: 'name' })).toEqual({ kind: 'newest' });
    expect(normalizeProductSource({ kind: 'best-sellers', days: 9999 })).toEqual({
      kind: 'best-sellers',
      days: 365,
    });
    expect(normalizeProductSource({ kind: 'best-sellers', days: 'x' })).toEqual({ kind: 'best-sellers' });
  });

  it('la query de la API, siempre igual para el mismo origen', () => {
    expect(productSourceQuery({ kind: 'manual', ids: ['a', 'b'] }, 2)).toBe('kind=manual&ids=a%2Cb&limit=2');
    expect(
      productSourceQuery({ kind: 'category', categoryId: 'c', includeChildren: false, sort: 'name' }),
    ).toBe('kind=category&categoryId=c&includeChildren=false&sort=name&limit=8');
    expect(productSourceQuery({ kind: 'brand', brand: 'A & B' }, 99)).toBe(
      'kind=brand&brand=A+%26+B&limit=24',
    );
    expect(productSourceQuery({ kind: 'best-sellers', days: 7 })).toBe('kind=best-sellers&days=7&limit=8');
    expect(productSourceQuery({ kind: 'on-sale', sort: 'price_desc' })).toBe(
      'kind=on-sale&sort=price_desc&limit=8',
    );
  });

  it('dos secciones con el mismo origen comparten un pedido', () => {
    const plans = sectionPlans([section('featured', {}, 'a'), section('featured', {}, 'b'), section('faq')]);
    expect(plans.size).toBe(1);
    expect([...plans.keys()][0]).toBe('kind=best-sellers&limit=8|kind=newest&limit=8');
  });
});

describe('cómo llega al render', () => {
  it('cada sección recibe lo de su plan, por id; lo que no se resolvió no está', () => {
    const featured = section('featured', { title: 'Lo mejor' });
    const sale = section('sale-products');
    const news = section('new-products');
    const resolved = {
      [planKey(sectionProductPlan(featured)!)]: [card('a', 'A con stock'), card('b')],
      [planKey(sectionProductPlan(sale)!)]: [],
    };
    expect(productsBySection([featured, sale, news], resolved)).toEqual({
      featured: resolved[planKey(sectionProductPlan(featured)!)],
      'sale-products': [],
    });
    expect(productsBySection([featured], {})).toEqual({});
  });

  it('"Ver todos" automático lleva al listado del origen', () => {
    expect(productSourceListingHref({ kind: 'category', categoryId: 'c-1' })).toBe('/productos?category=c-1');
    expect(productSourceListingHref({ kind: 'category', categoryId: 'c-1', sort: 'name' })).toBe(
      '/productos?category=c-1&sort=name',
    );
    expect(productSourceListingHref({ kind: 'brand', brand: 'A & B', sort: 'price_asc' })).toBe(
      '/productos?brand=A+%26+B&sort=price_asc',
    );
    expect(productSourceListingHref({ kind: 'newest' })).toBe('/productos?sort=newest');
    // El listado no sabe filtrar ofertas ni lo más vendido: el catálogo entero.
    expect(productSourceListingHref({ kind: 'on-sale' })).toBe('/productos?onSale=1');
    expect(productSourceListingHref({ kind: 'on-sale', sort: 'price_asc' })).toBe(
      '/productos?onSale=1&sort=price_asc',
    );
    expect(productSourceListingHref({ kind: 'best-sellers', days: 7 })).toBe('/productos?sort=best_sellers');
    expect(productSourceListingHref({ kind: 'manual', ids: ['a'] })).toBe('/productos');
  });

  it('destacados de una tienda sin ventas muestra lo último; si la API falla, nada', async () => {
    const plan = sectionProductPlan(section('featured'))!;
    const fetcher = vi.fn(async (source: { kind: string }) => (source.kind === 'newest' ? [card('n')] : []));
    expect(await resolvePlan(plan, fetcher)).toEqual([card('n')]);
    expect(fetcher).toHaveBeenCalledTimes(2);

    expect(await resolvePlan(plan, async () => null)).toBeNull();
    // Si el respaldo falla, queda lo (vacío) del origen.
    expect(await resolvePlan(plan, async (s) => (s.kind === 'newest' ? null : []))).toEqual([]);
  });
});

describe('pedidos a la API', () => {
  let api: MockApi;
  const dto = fixture<ProductDto>('/api/v1/products/by-slug/x');
  const SECTION = '/api/v1/products/section';

  /** Responde la sección según su `kind` (el mock de la API no mira la query). */
  function sectionsByKind(byKind: Record<string, ProductDto[] | number>) {
    const base = vi.mocked(fetch);
    const original = base.getMockImplementation()!;
    base.mockImplementation(async (input, init) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname !== SECTION) return original(input, init);
      api.calls.push({ method: 'GET', path: url.pathname + url.search, body: undefined, headers: {} });
      const answer = byKind[url.searchParams.get('kind')!] ?? [];
      return typeof answer === 'number'
        ? new Response('{}', { status: answer })
        : new Response(JSON.stringify({ items: answer }), { status: 200 });
    });
  }
  const sectionUrls = () => api.calls.filter((c) => c.path.startsWith(`${SECTION}?`)).map((c) => c.path);

  beforeEach(() => {
    api = mockApi();
  });
  afterEach(() => vi.restoreAllMocks());

  it('la portada pide un origen por sección, con la tienda en la URL (caché por tienda)', async () => {
    sectionsByKind({
      'best-sellers': [],
      newest: [{ ...dto, id: 'nuevo', name: 'Lo último' }],
      'on-sale': [{ ...dto, id: 'oferta', name: 'En oferta' }],
    });
    const resolved = await loadHomeSectionProducts(fixtureTenantId, [
      section('featured'),
      section('new-products'),
      section('sale-products'),
      { ...section('sale-products', {}, 'oculta'), visible: false },
    ]);

    // Destacados sin ventas cae a lo último: el mismo resultado que "recién llegados".
    expect(Object.values(resolved).map((list) => list.map((p) => p.name))).toEqual([
      ['Lo último'],
      ['Lo último'],
      ['En oferta'],
    ]);
    const urls = sectionUrls();
    expect(urls.every((u) => u.includes(`_mt=${fixtureTenantId}`))).toBe(true);
    expect(urls.map((u) => new URL(u, 'http://x').searchParams.get('kind')).sort()).toEqual([
      'best-sellers',
      'newest',
      'newest',
      'on-sale',
    ]);
  });

  it('si la API no tiene el endpoint o falla, esa sección queda como antes (sin romper la portada)', async () => {
    sectionsByKind({ newest: 404, 'on-sale': 400 });
    expect(
      await loadHomeSectionProducts(fixtureTenantId, [section('new-products'), section('sale-products')]),
    ).toEqual({});
    expect(await fetchSectionProducts(fixtureTenantId, { kind: 'newest' })).toBeNull();
    expect(await loadSectionProducts(fixtureTenantId, { kind: 'on-sale' }, 4)).toBeNull();
  });

  it('desde el browser: un pedido por origen, y los ids de a 24 en el orden pedido', async () => {
    sectionsByKind({ manual: [dto], 'on-sale': 500 });
    expect(
      (await fetchSectionProductsClient(fixtureTenantId, { kind: 'manual', ids: [dto.id] }))!,
    ).toHaveLength(1);
    expect(await fetchSectionProductsClient(fixtureTenantId, { kind: 'on-sale' })).toBeNull();

    api.calls.length = 0;
    const ids = Array.from({ length: 30 }, (_, i) => `id-${i}`);
    const found = await fetchProductsByIdsClient([...ids, 'id-0', ''], fixtureTenantId);
    const asked = sectionUrls().map((u) => new URL(u, 'http://x').searchParams);
    expect(asked.map((q) => q.get('ids')!.split(',').length)).toEqual([24, 6]);
    expect(asked.map((q) => q.get('limit'))).toEqual(['24', '6']);
    expect(asked[0]!.get('ids')!.split(',')[0]).toBe('id-0');
    expect(found).toHaveLength(2);
    expect(await fetchProductsByIdsClient([], fixtureTenantId)).toEqual([]);
  });
});
