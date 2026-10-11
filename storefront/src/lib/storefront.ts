import { headers } from 'next/headers';
import { fetchActiveProducts, fetchProductById, referencedProductIds, toStoreProducts } from './catalog';
import type { StoreProduct } from '@/components/store/sections';
import { resolveTenant } from './tenancy';
import type { Tenant, ThemeConfig } from '@tiendafy/types';

/** Base absoluta del sitio a partir del Host (http en localhost, https afuera). */
export async function siteBase(): Promise<string> {
  const host = (await headers()).get('host') ?? '';
  return host ? `http${host.includes('localhost') ? '' : 's'}://${host}` : '';
}

export interface StorefrontData {
  tenant: Tenant;
  products: StoreProduct[];
}

/** Resuelve tenant + productos mapeados a StoreProduct. Null si no hay tienda. */
export async function loadStorefront(): Promise<StorefrontData | null> {
  const tenant = await resolveTenant();
  if (!tenant) return null;

  // Tienda no activa (suspendida/cancelada): no tiene sentido traer productos;
  // la página decide qué fallback mostrar según el status.
  if (tenant.status !== 'ACTIVE') return { tenant, products: [] };

  const raw = await fetchActiveProducts(tenant.id);
  const products: StoreProduct[] = toStoreProducts(raw);

  return { tenant, products };
}

/**
 * Las secciones del home (destacados/ofertas) eligen productos por id. Si un
 * producto elegido quedó fuera del set inicial (que trae sólo los primeros 24),
 * el render lo descartaba en silencio. Acá traemos por id los referenciados que
 * falten y los sumamos, así siempre se muestran los que el merchant seleccionó.
 */
export async function withReferencedProducts(
  tenantId: string,
  theme: ThemeConfig,
  products: StoreProduct[],
): Promise<StoreProduct[]> {
  const present = new Set(products.map((p) => p.id));
  const missing = referencedProductIds(theme.sections).filter((id) => !present.has(id));
  if (missing.length === 0) return products;

  const fetched = await Promise.all(missing.map((id) => fetchProductById(tenantId, id)));
  return [...products, ...toStoreProducts(fetched)];
}
