import { PRODUCT_SOURCE_LIMIT, productSourceQuery, type ProductSource } from '@tiendafy/types';
import { apiUrl, clientJsonTenant, tenantHeaders } from './api-client';
import { toStoreProducts, type ProductDto } from './catalog-map';
import type { StoreProduct } from '@/components/store/ProductCard';

/**
 * Los productos de un origen desde el browser (la vista previa del editor:
 * el tema cambia sin recargar). Null si la API no respondió.
 */
export async function fetchSectionProductsClient(
  tenantId: string,
  source: ProductSource,
  limit?: number,
): Promise<StoreProduct[] | null> {
  const res = await clientJsonTenant<{ items: ProductDto[] }>(
    `/api/v1/products/section?${productSourceQuery(source, limit)}`,
    tenantId,
    { headers: { Accept: 'application/json' } },
  );
  return res ? toStoreProducts(res.items) : null;
}

/**
 * Productos por id desde el browser, en el orden pedido y solo los que se
 * pueden comprar (publicados). Antes era un pedido por producto; ahora uno
 * por cada 24 (el tope de la API por pedido).
 */
export async function fetchProductsByIdsClient(ids: string[], tenantId: string): Promise<StoreProduct[]> {
  const unique = [...new Set(ids.filter((id) => typeof id === 'string' && id))];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += PRODUCT_SOURCE_LIMIT.max)
    chunks.push(unique.slice(i, i + PRODUCT_SOURCE_LIMIT.max));
  const pages = await Promise.all(
    chunks.map((chunk) => fetchSectionProductsClient(tenantId, { kind: 'manual', ids: chunk }, chunk.length)),
  );
  return pages.flatMap((page) => page ?? []);
}

/** Una categoría como la devuelve la API (la ruta arma su link: ver category-url). */
interface SuggestedCategory {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  path: string;
  depth: number;
}

export interface SearchSuggestions {
  products: StoreProduct[];
  /** Cuántos productos encuentra la búsqueda entera. */
  total: number;
  categories: SuggestedCategory[];
}

/**
 * El buscador predictivo: los primeros productos (con stock primero), el
 * total y las categorías que se llaman así. Null si la API no respondió;
 * `signal` corta el pedido viejo cuando se sigue escribiendo.
 */
export async function fetchSearchSuggestionsClient(
  tenantId: string,
  q: string,
  limit = 6,
  signal?: AbortSignal,
): Promise<SearchSuggestions | null> {
  const qs = new URLSearchParams({ q, limit: String(limit) });
  const res = await clientJsonTenant<{ items: ProductDto[]; total: number; categories: SuggestedCategory[] }>(
    `/api/v1/products/suggest?${qs}`,
    tenantId,
    { signal },
  );
  return res
    ? { products: toStoreProducts(res.items ?? []), total: res.total ?? 0, categories: res.categories ?? [] }
    : null;
}

/**
 * "También te puede gustar" del carrito, según lo que tiene adentro (ver
 * CartSuggestions en el backend). Null si la API no respondió.
 */
export async function fetchCartSuggestionsClient(
  tenantId: string,
  variantIds: string[],
  limit = 3,
): Promise<StoreProduct[] | null> {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (variantIds.length > 0) qs.set('variants', variantIds.join(','));
  const res = await clientJsonTenant<{ items: ProductDto[] }>(
    `/api/v1/products/cart-suggestions?${qs}`,
    tenantId,
  );
  return res ? toStoreProducts(res.items ?? []) : null;
}

/** "Búsquedas populares": lo que más se buscó y encuentra algo. Vacío si la API no respondió. */
export async function fetchPopularSearchesClient(tenantId: string, limit = 6): Promise<string[]> {
  const res = await clientJsonTenant<{ items: { term: string }[] }>(
    `/api/v1/search/popular?limit=${limit}`,
    tenantId,
  );
  return (res?.items ?? []).map((i) => i.term).filter(Boolean);
}

/**
 * Lo más vendido para mostrar cuando no hay otra cosa (la página de 404, una
 * búsqueda sin resultados). Una tienda sin ventas todavía muestra lo más nuevo.
 */
export async function fetchPopularProductsClient(tenantId: string, limit = 4): Promise<StoreProduct[]> {
  const best = await fetchSectionProductsClient(tenantId, { kind: 'best-sellers' }, limit);
  if (best && best.length > 0) return best;
  return (await fetchSectionProductsClient(tenantId, { kind: 'newest' }, limit)) ?? [];
}

/**
 * Cuenta una búsqueda hecha (la página de resultados, no cada tecla del
 * predictivo). Lo que encontró lo cuenta el servidor. Nunca falla: medir no
 * puede romper la búsqueda.
 */
export function logSearchClient(tenantId: string, q: string): void {
  try {
    void fetch(`${apiUrl()}/api/v1/search/log`, {
      method: 'POST',
      headers: tenantHeaders(tenantId, true),
      body: JSON.stringify({ q }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* sin red o sin fetch: no se cuenta */
  }
}
