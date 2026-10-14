import { productSourceQuery, type ProductSource } from '@tiendafy/types';
import { apiGetTenant } from './api';
import type { ProductDto } from './catalog-map';
import { cacheFor, REVALIDATE } from './cache';

interface OptionFacet {
  name: string;
  values: string[];
}

/** Un campo de ficha técnica con los valores que existen en el set actual. */
export interface SpecFacet {
  definitionId: string;
  key: string;
  name: string;
  unit: string | null;
  values: string[];
}

export interface ProductFacets {
  brands: string[];
  options: OptionFacet[];
  priceMin: number | null; // en centavos
  priceMax: number | null;
  /** Puede faltar en una respuesta cacheada de antes de existir el campo. */
  specs?: SpecFacet[];
  /** Cuántos de la búsqueda están en oferta (sin el filtro de ofertas). Puede faltar, como `specs`. */
  onSale?: number;
  /** Cuántos tienen stock (sin el filtro "Solo con stock"). Puede faltar, como `specs`. */
  inStock?: number;
}

interface ProductsPage {
  items: ProductDto[];
  hasMore: boolean;
}

export async function fetchActiveProducts(tenantId: string): Promise<ProductDto[]> {
  // Data cache 30s (keyed por tenant vía _mt): baja TTFB y crawl budget sin
  // riesgo cross-tenant. Un producto nuevo aparece en ≤30s.
  const page = await apiGetTenant<ProductsPage>(
    '/api/v1/products?status=ACTIVE&limit=24',
    tenantId,
    cacheFor('catalog', tenantId),
  );
  return page?.items ?? [];
}

/** Lo máximo que admite un sitemap (protocolo sitemaps.org). */
export const SITEMAP_MAX_URLS = 50_000;

/** Lo que devuelve el listado en modo cursor: lo que hace falta para seguir. */
interface CursorPage {
  items: { slug: string; updatedAtUtc?: string | null; createdAtUtc?: string | null }[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Los slugs de TODOS los productos activos, recorriendo el cursor de a cien
 * (el tope por página del backend). Lo usa el sitemap: antes pedía una sola
 * página, y una tienda con miles de productos le mostraba a Google los
 * primeros cien. Si una página falla a mitad de camino, devuelve lo que juntó:
 * un sitemap incompleto es mejor que uno vacío.
 */
export async function fetchAllActiveSlugs(tenantId: string, max = SITEMAP_MAX_URLS): Promise<string[]> {
  return (await fetchAllActiveEntries(tenantId, max)).map((e) => e.slug);
}

/** Un producto en el sitemap: su slug y cuándo cambió por última vez (si la API lo dice). */
export interface SitemapEntry {
  slug: string;
  /** ISO 8601. Falta en una respuesta de antes de existir el campo. */
  lastmod?: string;
}

/**
 * Lo mismo que fetchAllActiveSlugs, con la fecha del último cambio de cada
 * producto: el lastmod del sitemap, para que Google vuelva primero a lo que
 * cambió (un precio, una foto) en vez de recorrer todo igual.
 */
export async function fetchAllActiveEntries(
  tenantId: string,
  max = SITEMAP_MAX_URLS,
): Promise<SitemapEntry[]> {
  // Map por slug: con cada página cacheada por separado, dos páginas vencidas
  // en momentos distintos pueden repetir un producto que cambió de lugar.
  const slugs = new Map<string, SitemapEntry>();
  let after: string | null = null;

  do {
    const qs = new URLSearchParams({ status: 'ACTIVE', limit: '100' });
    if (after) qs.set('after', after);
    // Cada página del cursor queda en la Data Cache una hora: el sitemap se
    // arma recorriendo todo el catálogo, y antes lo hacía entero en cada pedido.
    const page: CursorPage | null = await apiGetTenant<CursorPage>(
      `/api/v1/products?${qs}`,
      tenantId,
      cacheFor('catalog', tenantId, REVALIDATE.sitemap),
    ).catch(() => null);
    if (!page) break;

    for (const p of page.items) {
      const lastmod = p.updatedAtUtc ?? p.createdAtUtc ?? undefined;
      if (!slugs.has(p.slug)) slugs.set(p.slug, lastmod ? { slug: p.slug, lastmod } : { slug: p.slug });
    }
    // Un cursor que se repite cortaría en un bucle infinito: se corta ahí.
    after = page.hasMore && page.nextCursor !== after ? page.nextCursor : null;
  } while (after && slugs.size < max);

  return [...slugs.values()].slice(0, max);
}

/**
 * Los productos de una sección de la portada según su origen (elegidos a
 * mano, categoría, marca, lo último, ofertas, lo más vendido), en un solo
 * pedido. Antes lo elegido se pedía de a uno por /products/{id}, que no
 * filtra estado: un borrador o un archivado seguía en la portada.
 *
 * Null si no se pudo: la API caída o sin el endpoint (404). Quien llama deja
 * esa sección como estaba en vez de romper la portada entera.
 */
export async function fetchSectionProducts(
  tenantId: string,
  source: ProductSource,
  limit?: number,
): Promise<ProductDto[] | null> {
  try {
    // Data Cache como el resto del catálogo, y con el tenant en la URL (_mt,
    // lo pone apiGetTenant): la caché no mira headers.
    const res = await apiGetTenant<{ items: ProductDto[] }>(
      `/api/v1/products/section?${productSourceQuery(source, limit)}`,
      tenantId,
      cacheFor('catalog', tenantId),
    );
    return res?.items ?? null;
  } catch {
    return null;
  }
}

interface ProductSearchResult {
  items: ProductDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  facets: ProductFacets;
}

const EMPTY_FACETS: ProductFacets = { brands: [], options: [], priceMin: null, priceMax: null, specs: [] };

export interface CategoryDto {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  path: string;
  depth: number;
}

interface SearchParams {
  q?: string;
  category?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
  priceMin?: number; // en pesos
  priceMax?: number;
  brand?: string;
  options?: string[]; // valores de opción seleccionados (Color/Talle/…)
  /** Pares `<definitionId>:<valor>` de ficha técnica. */
  specs?: string[];
  /** Solo lo que está en oferta (precio tachado). */
  onSale?: boolean;
  /** Solo lo que tiene stock. Sin esto lo agotado igual va al final (lo ordena la API). */
  inStock?: boolean;
}

export async function searchProducts(tenantId: string, params: SearchParams): Promise<ProductSearchResult> {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.category) qs.set('category', params.category);
  if (params.sort) qs.set('sort', params.sort);
  if (params.priceMin != null) qs.set('priceMin', String(params.priceMin));
  if (params.priceMax != null) qs.set('priceMax', String(params.priceMax));
  if (params.brand) qs.set('brand', params.brand);
  for (const o of params.options ?? []) qs.append('option', o);
  // Ficha técnica: <definitionId>:<valor>, repetible.
  for (const sp of params.specs ?? []) qs.append('spec', sp);
  if (params.onSale) qs.set('onSale', 'true');
  if (params.inStock) qs.set('inStock', 'true');
  qs.set('page', String(params.page ?? 1));
  qs.set('pageSize', String(params.pageSize ?? 24));

  const res = await apiGetTenant<ProductSearchResult>(
    `/api/v1/products/search?${qs.toString()}`,
    tenantId,
    cacheFor('catalog', tenantId),
  );
  return (
    res ?? {
      items: [],
      total: 0,
      page: 1,
      pageSize: params.pageSize ?? 24,
      totalPages: 0,
      facets: EMPTY_FACETS,
    }
  );
}

export async function fetchCategories(tenantId: string): Promise<CategoryDto[]> {
  const res = await apiGetTenant<{ items: CategoryDto[] }>(
    '/api/v1/categories',
    tenantId,
    cacheFor('categories', tenantId),
  );
  return res?.items ?? [];
}

/** ProductDto del backend → StoreProduct para grillas/cards. Null si no tiene variantes. */

// Los tipos y mappers puros viven en catalog-map (importable desde el cliente).
export type { VariantDto, ProductDto } from './catalog-map';
export { toStoreProduct, toStoreProducts } from './catalog-map';
