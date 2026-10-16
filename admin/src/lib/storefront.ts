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

/**
 * La tienda por su subdominio ({sub}.dominio). Es la que usa la vista previa
 * del editor: anda para cualquier tienda y no depende del dominio propio ni
 * de cuál es la principal.
 */
export const storefrontUrl = (subdomain: string, path = ''): string =>
  TEMPLATE.replace('{sub}', subdomain) + path;

/** Solo el host, para mostrar ("mitienda.localhost:3000"). */
export const storefrontHost = (subdomain: string): string =>
  storefrontUrl(subdomain).replace(/^https?:\/\//, '');

/** Lo que hace falta de una tienda para saber su dirección pública. */
interface PublicStore {
  subdomain: string;
  customDomain?: string | null;
}

/**
 * La dirección con la que la gente ve la tienda: el dominio propio si lo
 * conectó; si es la tienda principal de la instalación, el dominio a secas;
 * si no, el subdominio. Es la que va en "Ver tienda", en los links que se
 * comparten y en la vista previa de Google: antes la tienda principal
 * aparecía como puenteoriente.puenteoriente.com.ar.
 */
export function storePublicUrl(store: PublicStore, path = ''): string {
  const custom = store.customDomain?.trim();
  if (custom) return `https://${custom.replace(/^https?:\/\//, '').replace(/\/+$/, '')}${path}`;
  const primary = runtime.primaryStoreSubdomain;
  if (primary && store.subdomain.toLowerCase() === primary) return TEMPLATE.replace('{sub}.', '') + path;
  return storefrontUrl(store.subdomain, path);
}

/** Solo el host público, para mostrar ("puenteoriente.com.ar"). */
export const storePublicHost = (store: PublicStore): string =>
  storePublicUrl(store).replace(/^https?:\/\//, '');
