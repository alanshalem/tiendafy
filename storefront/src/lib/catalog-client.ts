import { PRODUCT_SOURCE_LIMIT, productSourceQuery, type ProductSource } from '@tiendafy/types';
import { clientJsonTenant } from './api-client';
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
