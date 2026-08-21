import { NextResponse, type NextRequest } from 'next/server';

/**
 * Deja la ruta pedida en un encabezado.
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
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Los archivos estáticos no pueden terminar en la pantalla de 404 de la
  // tienda, así que no tiene sentido hacerlos pasar por acá.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml).*)'],
};
