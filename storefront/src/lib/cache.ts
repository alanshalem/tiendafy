/**
 * Ventanas de revalidate de la Data Cache de Next, con nombre según intención
 * (antes los números vivían sueltos en 9 call-sites y "60" significaba dos
 * cosas distintas). Cambiar un valor acá cambia el TTL de esa familia entera.
 */
export const REVALIDATE = {
  /** Catálogo público (listas, búsquedas, producto por slug/id). */
  catalog: 30,
  /** Páginas CMS institucionales del merchant. */
  cms: 30,
  /** Árbol de categorías. */
  categories: 60,
  /** Términos/privacidad (plantilla u override CMS). */
  legal: 60,
  /**
   * Qué tienda atiende cada host. Se pedía en cada vista de página; un cambio
   * de estado (suspender, eliminar) tarda hasta esto en verse en la tienda.
   */
  tenant: 60,
  /**
   * El diseño publicado. Más corto que el resto: después de publicar, el
   * comercio entra a mirar su tienda y espera ver el cambio.
   */
  theme: 30,
  /** El sitemap: recorre el catálogo entero, y Google no lo lee a cada minuto. */
  sitemap: 3600,
} as const;

/**
 * Lo que el backend puede pedir que se refresque al instante (ver
 * app/internal/revalidate): publicar un diseño, cambiar productos, precios,
 * stock o categorías, o el estado de una tienda. Los tiempos de arriba quedan
 * como respaldo por si ese aviso no llega.
 */
export const CACHE_SCOPES = ['theme', 'catalog', 'categories', 'tenant'] as const;
export type CacheScope = (typeof CACHE_SCOPES)[number];

/**
 * La etiqueta de la Data Cache de una familia, por tienda. "Qué tienda atiende
 * este host" se pide antes de saber la tienda, así que esa va sin id: cambiar
 * el estado de una refresca la resolución de todas (es un pedido por host).
 */
export function cacheTag(scope: CacheScope, tenantId: string): string {
  return scope === 'tenant' ? 'tenants' : `${scope}:${tenantId}`;
}

/** Opciones de fetch cacheado de una familia: su ventana de tiempo y su etiqueta. */
export function cacheFor(scope: Exclude<CacheScope, 'tenant'>, tenantId: string, revalidate?: number) {
  return { next: { revalidate: revalidate ?? REVALIDATE[scope], tags: [cacheTag(scope, tenantId)] } };
}
