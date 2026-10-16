import { headers } from 'next/headers';
import { notFound, permanentRedirect } from 'next/navigation';

import { apiGetTenant } from '@/lib/api';
import { resolveTenant } from '@/lib/tenancy';

/**
 * La redirección que el comercio dejó para la URL pedida, si hay una.
 *
 * Antes la buscaba la pantalla de 404 (app/not-found.tsx), pensando que solo
 * se arma cuando la página no existe. No es así: Next arma esa pantalla en
 * CADA página (va lista en la respuesta, por si hace falta), así que cada
 * vista le costaba a la API una consulta sin caché. Y cuando el 404 lo
 * decidía una página (un producto borrado), la redirección encontrada ahí ya
 * no podía cambiar el status: salía un 404 y redirigía recién el navegador,
 * con JS. Ahora se consulta solo donde nace un 404 de verdad (ver
 * notFoundUnlessRedirected), antes de mandar nada.
 */
async function redirectTarget(): Promise<string | null> {
  try {
    // Lo deja el proxy: un componente de servidor no puede saber por su
    // cuenta qué URL se pidió.
    const path = (await headers()).get('x-pathname');
    if (!path) return null;

    const tenant = await resolveTenant();
    if (!tenant) return null;

    // Por la API interna (lib/api), no por la URL pública que usa el
    // navegador: el servidor no tiene por qué salir a internet y volver.
    // Sin reintentos: una redirección que no llegó al primer intento no vale
    // la espera, y el 404 (lo más común: no hay ninguna cargada) es null.
    // El tope de tiempo es el de todo pedido a la API (API_TIMEOUT_MS).
    const data = await apiGetTenant<{ to?: string }>(
      `/api/v1/redirects/resolve?path=${encodeURIComponent(path)}`,
      tenant.id,
      { cache: 'no-store' },
      0,
    );
    return data?.to ?? null;
  } catch {
    // Una redirección que no se pudo resolver no puede tapar el 404.
    return null;
  }
}

/**
 * Lo que no existe: un 308 a donde el comercio lo mandó (una URL vieja de un
 * producto renombrado, por ejemplo) o, si no dejó nada, el 404. Va antes de
 * empezar a mandar la página, que después el status ya salió.
 */
export async function notFoundUnlessRedirected(): Promise<never> {
  const target = await redirectTarget();
  if (target) permanentRedirect(target);
  notFound();
}
