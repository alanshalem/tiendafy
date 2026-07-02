import { apiGetTenant } from './api';
import { formatMoney } from '@tiendafy/types';
import type { StoreProduct } from '@/components/store/sections';

export interface MoneyDto {
  amount: number;
  currency: string;
}

export interface VariantDto {
  id: string;
  sku: string;
  optionValues: string[];
  price: MoneyDto;
  compareAtPrice: MoneyDto | null;
}

export interface ProductImageDto {
  id: string;
  url: string;
  altText: string | null;
  position: number;
}

export interface ProductDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  brand: string | null;
  variants: VariantDto[];
  images: ProductImageDto[];
  stock: number | null;
}

export interface OptionFacet {
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
  const page = await apiGetTenant<ProductsPage>('/api/v1/products?status=ACTIVE&limit=24', tenantId, {
    cache: 'no-store',
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

export interface ProductSearchResult {
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

export interface SearchParams {
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
    next: { revalidate: 30 },
  });
  return res ?? { items: [], total: 0, page: 1, pageSize: params.pageSize ?? 24, totalPages: 0, facets: EMPTY_FACETS };
}

export async function fetchCategories(tenantId: string): Promise<CategoryDto[]> {
  const res = await apiGetTenant<{ items: CategoryDto[] }>('/api/v1/categories', tenantId, {
    next: { revalidate: 60 },
  });
  return res?.items ?? [];
}

/** ProductDto del backend → StoreProduct para grillas/cards. Null si no tiene variantes. */
export function toStoreProduct(p: ProductDto): StoreProduct | null {
  const v = p.variants[0];
  if (!v) return null;
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    priceAmount: v.price.amount,
    currency: v.price.currency,
    compareAtAmount: v.compareAtPrice?.amount ?? null,
    image: p.images[0]?.url ?? null,
    images: p.images.map((img) => img.url),
    variantId: v.id,
    variantLabel: v.optionValues.length > 0 ? v.optionValues.join(' / ') : 'Única',
    stock: p.stock ?? null,
  };
}

export function formatPrice(money: MoneyDto): string {
  return formatMoney(money.amount, money.currency);
}
