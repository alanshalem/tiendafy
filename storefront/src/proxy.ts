import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp, isCardChallengePage } from './lib/csp';
import { serverRuntimeConfig } from './lib/runtime';

/**
 * Dos cosas en cada pedido de página:
 *
 * - El Content-Security-Policy, armado con la API de ESTE ambiente (la que se
 *   inyecta al arrancar el contenedor). Al compilar no se conoce: ver lib/csp.ts.
 * - La ruta pedida en un encabezado (abajo).
 *
 * La pantalla de 404 necesita saber qué URL pidió el visitante para poder
 * buscar si el comercio dejó una redirección, y un componente de servidor no
 * tiene forma de averiguarlo por su cuenta (`usePathname` es de cliente). Esto
 * no consulta nada ni bloquea: copia un dato que ya viene en el request.
 *
 * Va en `proxy.ts` y no en `middleware.ts` porque Next 16 renombró la
 * convención; el archivo viejo sigue funcionando pero está deprecado.
 */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set('x-pathname', request.nextUrl.pathname);
  const response = NextResponse.next({ request: { headers } });
  const runtime = serverRuntimeConfig();
  response.headers.set(
    'Content-Security-Policy',
    buildCsp(runtime.apiUrl, {
      cardChallenge: isCardChallengePage(request.nextUrl.pathname),
      adminOrigin: runtime.adminOrigin,
      dev: process.env.NODE_ENV === 'development',
    }),
  );
  return response;
}

export const config = {
  // Los archivos estáticos no pueden terminar en la pantalla de 404 de la
  // tienda, así que no tiene sentido hacerlos pasar por acá.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml).*)'],
};
