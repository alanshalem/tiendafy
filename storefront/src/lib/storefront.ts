import { headers } from 'next/headers';
import { fetchActiveProducts, fetchSectionProducts, toStoreProducts } from './catalog';
import type { StoreProduct } from '@/components/store/ProductCard';
import { resolvePlans, sectionPlans, type SectionProductsMap } from './section-products';
import { resolveTenant } from './tenancy';
import type { ProductSource, Tenant, ThemeSection } from '@tiendafy/types';

/** Base absoluta del sitio a partir del Host (http en localhost, https afuera). */
export async function siteBase(): Promise<string> {
  const host = (await headers()).get('host') ?? '';
  return host ? `http${host.includes('localhost') ? '' : 's'}://${host}` : '';
}

export interface StorefrontData {
  tenant: Tenant;
  products: StoreProduct[];
}

/**
 * Resuelve tenant + productos mapeados a StoreProduct. Null si no hay tienda.
 *
 * `products: false` para las páginas que no muestran catálogo (checkout, el
 * resultado del pago): antes se pedían igual los 24 primeros y se tiraban.
 */
export async function loadStorefront({ products: withProducts = true } = {}): Promise<StorefrontData | null> {
  const tenant = await resolveTenant();
  if (!tenant) return null;

  // Tienda no activa (suspendida/cancelada): no tiene sentido traer productos;
  // la página decide qué fallback mostrar según el status.
  if (tenant.status !== 'ACTIVE' || !withProducts) return { tenant, products: [] };

  const raw = await fetchActiveProducts(tenant.id);
  const products: StoreProduct[] = toStoreProducts(raw);

  return { tenant, products };
}

/**
 * Los productos de UN origen (ver ProductSource), ya mapeados para las cards:
 * solo publicados, en un pedido, cacheado unos segundos por tienda. Null si
 * la API no respondió: la sección queda como estaba, sin romper la portada.
 */
export async function loadSectionProducts(
  tenantId: string,
  source: ProductSource,
  limit?: number,
): Promise<StoreProduct[] | null> {
  const dtos = await fetchSectionProducts(tenantId, source, limit);
  return dtos ? toStoreProducts(dtos) : null;
}

/**
 * Lo de todas las secciones de productos visibles de la portada, por plan
 * (ver lib/section-products). Va a StorefrontView como `sectionProducts`.
 *
 * Reemplaza a `withReferencedProducts`, que pedía de a uno los elegidos a mano
 * que faltaran y no miraba el estado: un borrador elegido se mostraba igual.
 * Y las secciones sin elegidos ya no salen de los 24 más nuevos: destacados
 * son lo más vendido, recién llegados lo último y ofertas las de todo el catálogo.
 */
export async function loadHomeSectionProducts(
  tenantId: string,
  sections: ThemeSection[],
): Promise<SectionProductsMap> {
  return resolvePlans(sectionPlans(sections.filter((s) => s.visible)), (source, limit) =>
    loadSectionProducts(tenantId, source, limit),
  );
}
