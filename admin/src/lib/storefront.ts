/**
 * URL pública de la tienda de un subdominio. La plantilla viene de
 * VITE_STOREFRONT_ORIGIN (con el marcador {sub}) y se hornea en el build:
 * - dev (default): http://{sub}.localhost:3000 — si tu storefront corre en
 *   otro puerto, sobreescribila en admin/.env.local
 * - prod: https://{sub}.TU_DOMINIO (la pasa el compose / docker-release)
 * Antes el puerto 3000 estaba hardcodeado en 5 pantallas: en prod "Ver mi
 * tienda" apuntaba a localhost.
 */
const TEMPLATE: string =
  (import.meta.env.VITE_STOREFRONT_ORIGIN as string | undefined) ?? 'http://{sub}.localhost:3000';

export const storefrontUrl = (subdomain: string, path = ''): string =>
  TEMPLATE.replace('{sub}', subdomain) + path;

/** Solo el host, para mostrar ("mitienda.localhost:3000"). */
export const storefrontHost = (subdomain: string): string =>
  storefrontUrl(subdomain).replace(/^https?:\/\//, '');
