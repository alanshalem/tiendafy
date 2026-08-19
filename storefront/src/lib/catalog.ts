import { apiGetTenant } from './api';
import type { ProductDto } from './catalog-map';
import { REVALIDATE } from './cache';

interface OptionFacet {
  name: string;
  values: string[];
}

export interface ProductFacets {
  brands: string[];
  options: OptionFacet[];
  priceMin: number | null; // en centavos
  priceMax: number | null;
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

/** Un producto por id. Lo usan las secciones que referencian productos
 *  puntuales (destacados/ofertas) que pueden quedar fuera del set inicial. */
export async function fetchProductById(tenantId: string, id: string): Promise<ProductDto | null> {
  return apiGetTenant<ProductDto>(`/api/v1/products/${id}`, tenantId, {
    cache: 'no-store',
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

const EMPTY_FACETS: ProductFacets = { brands: [], options: [], priceMin: null, priceMax: null };

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
