import { readJson, writeJson } from './storage';

/**
 * "Vistos recientemente": los productos que el comprador abrió en esta
 * tienda, en este navegador, del último al primero.
 *
 * Se guardan solo los ids (no el precio ni la foto): al mostrarlos se piden
 * de nuevo, así el precio es el de hoy, lo agotado se ve agotado y lo que se
 * despublicó desaparece solo.
 */

/** Cuántos se recuerdan: más que eso ya no es "reciente". */
export const RECENTLY_VIEWED_MAX = 12;

/** Lo que avisa a los otros componentes de la página que la lista cambió. */
export const RECENTLY_VIEWED_EVENT = 'tiendafy:recently-viewed';

export const recentlyViewedKey = (tenantId: string) => `tiendafy.recent.${tenantId}`;

export function readRecentlyViewed(tenantId: string): string[] {
  const value = readJson<unknown>(recentlyViewedKey(tenantId), []);
  // Lo guardado lo pudo tocar cualquiera (otra versión, una extensión): solo ids de texto.
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && !!id) : [];
}

/** Suma una vista: el producto pasa adelante, sin repetirse, y la lista no pasa del tope. */
export function recordProductView(tenantId: string, productId: string): string[] {
  const next = [productId, ...readRecentlyViewed(tenantId).filter((id) => id !== productId)].slice(
    0,
    RECENTLY_VIEWED_MAX,
  );
  writeJson(recentlyViewedKey(tenantId), next);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(RECENTLY_VIEWED_EVENT, { detail: { tenantId } }));
  }
  return next;
}
