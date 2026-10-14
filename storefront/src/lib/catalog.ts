import { apiGetTenant } from './api';
import type { ProductDto } from './catalog-map';
import { REVALIDATE } from './cache';

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
}

interface ProductsPage {
  items: ProductDto[];
  hasMore: boolean;
}

export async function fetchActiveProducts(tenantId: string): Promise<ProductDto[]> {
  // Data cache 30s (keyed por tenant vía _mt): baja TTFB y crawl budget sin
  // riesgo cross-tenant. Un producto nuevo aparece en ≤30s.
  const page = await apiGetTenant<ProductsPage>('/api/v1/products?status=ACTIVE&limit=24', tenantId, {
    next: { revalidate: REVALIDATE.catalog },
  });
  return page?.items ?? [];
}

/** Lo máximo que admite un sitemap (protocolo sitemaps.org). */
export const SITEMAP_MAX_URLS = 50_000;

/** Lo que devuelve el listado en modo cursor: lo que hace falta para seguir. */
interface CursorPage {
  items: { slug: string }[];
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
  // Set: con cada página cacheada por separado, dos páginas vencidas en
  // momentos distintos pueden repetir un producto que cambió de lugar.
  const slugs = new Set<string>();
  let after: string | null = null;

  do {
    const qs = new URLSearchParams({ status: 'ACTIVE', limit: '100' });
    if (after) qs.set('after', after);
    // Cada página del cursor queda en la Data Cache una hora: el sitemap se
    // arma recorriendo todo el catálogo, y antes lo hacía entero en cada pedido.
    const page: CursorPage | null = await apiGetTenant<CursorPage>(`/api/v1/products?${qs}`, tenantId, {
      next: { revalidate: REVALIDATE.sitemap },
    }).catch(() => null);
    if (!page) break;

    for (const p of page.items) slugs.add(p.slug);
    // Un cursor que se repite cortaría en un bucle infinito: se corta ahí.
    after = page.hasMore && page.nextCursor !== after ? page.nextCursor : null;
  } while (after && slugs.size < max);

  return [...slugs].slice(0, max);
}

/** Un producto por id. Lo usan las secciones que referencian productos
 *  puntuales (destacados/ofertas) que pueden quedar fuera del set inicial. */
export async function fetchProductById(tenantId: string, id: string): Promise<ProductDto | null> {
  return apiGetTenant<ProductDto>(`/api/v1/products/${id}`, tenantId, {
    next: { revalidate: REVALIDATE.catalog },
  });
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
  qs.set('page', String(params.page ?? 1));
  qs.set('pageSize', String(params.pageSize ?? 24));

  const res = await apiGetTenant<ProductSearchResult>(`/api/v1/products/search?${qs.toString()}`, tenantId, {
    next: { revalidate: REVALIDATE.catalog },
  });
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
  const res = await apiGetTenant<{ items: CategoryDto[] }>('/api/v1/categories', tenantId, {
    next: { revalidate: REVALIDATE.categories },
  });
  return res?.items ?? [];
}

/** ProductDto del backend → StoreProduct para grillas/cards. Null si no tiene variantes. */

// Los tipos y mappers puros viven en catalog-map (importable desde el cliente).
export type { VariantDto, ProductDto } from './catalog-map';
export { toStoreProduct, toStoreProducts, referencedProductIds } from './catalog-map';
