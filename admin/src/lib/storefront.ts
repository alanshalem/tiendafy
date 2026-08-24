/**
 * URL pública de la tienda de un subdominio. La plantilla lleva el marcador
 * {sub} y llega en runtime (ver lib/runtime): la misma imagen sirve para
 * staging y para producción.
 * - dev (default): http://{sub}.localhost:3000 — si tu storefront corre en
 *   otro puerto, sobreescribila en admin/.env.local
 * - servidor: https://{sub}.TU_DOMINIO
 * Antes el puerto 3000 estaba hardcodeado en 5 pantallas: en prod "Ver mi
 * tienda" apuntaba a localhost.
 */
import { runtime } from './runtime';

const TEMPLATE: string = runtime.storefrontOrigin;

export const storefrontUrl = (subdomain: string, path = ''): string =>
  TEMPLATE.replace('{sub}', subdomain) + path;

/** Solo el host, para mostrar ("mitienda.localhost:3000"). */
export const storefrontHost = (subdomain: string): string =>
  storefrontUrl(subdomain).replace(/^https?:\/\//, '');
