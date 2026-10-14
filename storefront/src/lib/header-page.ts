import type { HeaderPageKind } from '@tiendafy/types';

/** Páginas de contenido fijas de la tienda (además de las que publica el comercio en /paginas). */
const CONTENT_PATHS = ['/contacto', '/privacidad', '/terminos', '/arrepentimiento'];

const under = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

/**
 * Qué tipo de página es una ruta, para el color del encabezado por página.
 *
 * Sale de la ruta y no de un efecto en el navegador: el encabezado lo lee con
 * usePathname, que da lo mismo en el render del servidor y en la hidratación.
 * Así el HTML ya llega con el color de esa página (sin un parpadeo del color
 * general). `/preview` es el inicio dentro del editor. Lo que no es ninguno
 * (favoritos, la cuenta, una página que no existe) usa el color general.
 */
export function headerPageKind(pathname: string): HeaderPageKind | null {
  if (pathname === '/' || pathname === '/preview') return 'home';
  if (pathname === '/productos') return 'listing';
  if (pathname.startsWith('/productos/')) return 'product';
  if (under(pathname, '/paginas') || CONTENT_PATHS.some((p) => under(pathname, p))) return 'content';
  if (under(pathname, '/checkout')) return 'checkout';
  return null;
}
