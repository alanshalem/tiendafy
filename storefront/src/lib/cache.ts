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
