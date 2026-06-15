import { headers } from 'next/headers';
import type { Tenant } from '@tiendafy/types';
import { apiGet } from './api';

/**
 * Resuelve el tenant del request actual por Host header contra el backend.
 * Cache por request la hace React (fetch dedupe); cache cross-request por
 * tenant llega con Redis en fase de escala.
 */
export async function resolveTenant(): Promise<Tenant | null> {
  const headerList = await headers();
  const host = headerList.get('host');
  if (!host) return null;

  return apiGet<Tenant>(`/api/v1/tenants/resolve?host=${encodeURIComponent(host)}`, {
    // Sin cache: el status de la tienda (activa/suspendida/eliminada) debe
    // reflejarse al instante. Eliminar una tienda corta el storefront ya, sin
    // ventana de cache que la siga sirviendo. (Se cachea en Redis al escalar.)
    cache: 'no-store',
  });
}
