import { clientJsonTenant } from './api-client';
import { toStoreProducts, type ProductDto } from './catalog';
import type { StoreProduct } from '@/components/store/sections';

/** Trae productos por id desde el browser y los convierte a StoreProduct. */
export async function fetchProductsByIdsClient(ids: string[], tenantId: string): Promise<StoreProduct[]> {
  const dtos = await Promise.all(
    ids.map((id) =>
      clientJsonTenant<ProductDto>(`/api/v1/products/${id}`, tenantId, {
        headers: { Accept: 'application/json' },
      }),
    ),
  );
  return toStoreProducts(dtos);
}
