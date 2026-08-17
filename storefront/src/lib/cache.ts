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
} as const;
