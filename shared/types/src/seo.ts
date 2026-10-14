/**
 * Cómo se presenta la portada en Google y al compartir el link. Lo usan la
 * tienda (metadata de la home) y el editor (la vista previa del resultado):
 * si cada uno armara su default, la vista previa mostraría un texto que
 * Google nunca ve.
 */

/** Hasta acá Google muestra el título entero (unos 580 px); más, lo corta con "…". */
export const SEO_TITLE_IDEAL = 60;
/** Hasta acá entra la descripción en el resultado; más, se corta. */
export const SEO_DESCRIPTION_IDEAL = 160;
/** Menos que esto desaprovecha el lugar (y Google suele reemplazarla por otro texto de la página). */
export const SEO_DESCRIPTION_SHORT = 70;

/** El título de la portada: el que eligió el comercio, o uno con la marca. */
export function homeSeoTitle(seoTitle: string | null | undefined, storeName: string): string {
  return seoTitle?.trim() || `${storeName} — Tienda online`;
}

/** La descripción de la portada: la del comercio, o una genérica con la marca. */
export function homeSeoDescription(seoDescription: string | null | undefined, storeName: string): string {
  return seoDescription?.trim() || `Comprá online en ${storeName}. Envíos a todo el país y pago seguro.`;
}

/** Un texto cortado como lo corta Google: en una palabra, con "…". */
export function truncateForSnippet(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:—-]+$/, '')}…`;
}
