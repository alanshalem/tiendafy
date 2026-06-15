import { headers } from 'next/headers';
import { fetchActiveProducts, toStoreProduct } from './catalog';
import type { StoreProduct } from '@/components/store/sections';
import { resolveTenant } from './tenancy';
import type { Tenant } from '@tiendafy/types';

const PLATFORM_BASE_DOMAIN = process.env.PLATFORM_BASE_DOMAIN ?? 'localhost';

export async function isPlatformHost(): Promise<boolean> {
  const headerList = await headers();
  const hostname = (headerList.get('host') ?? '').split(':')[0];
  return hostname === PLATFORM_BASE_DOMAIN || hostname === `www.${PLATFORM_BASE_DOMAIN}`;
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
  const products: StoreProduct[] = raw
    .map(toStoreProduct)
    .filter((p): p is StoreProduct => p !== null);

  return { tenant, products };
}
