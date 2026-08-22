/**
 * Helpers de color compartidos (storefront + admin).
 *
 * Los colores del tema se guardan como canal RGB crudo "R G B" (para alpha de
 * Tailwind); este helper vivía duplicado en `theme-editor-inputs` (contrastText)
 * y `lib/theme` (contrastFg) con la misma fórmula de luminancia.
 */

/**
 * Texto legible (oscuro o blanco) según la luminancia de un color de fondo "R G B".
 * Devuelve "17 24 39" (gris oscuro) sobre fondos claros, "255 255 255" (blanco) si no.
 */
export function contrastText(rgbRaw: string): string {
  const [r, g, b] = rgbRaw.trim().split(/\s+/).map(Number);
  const lum = (0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)) / 255;
  return lum > 0.6 ? '17 24 39' : '255 255 255';
}

/** "R G B" → [r,g,b] con 0 por defecto para lo que no parsee. */
function channels(rgbRaw: string): [number, number, number] {
  const [r, g, b] = rgbRaw.trim().split(/\s+/).map(Number);
  return [r || 0, g || 0, b || 0];
}

/** Luminancia relativa según WCAG (con la corrección de gamma, no el promedio simple). */
function relativeLuminance(rgbRaw: string): number {
  const [r, g, b] = channels(rgbRaw).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Relación de contraste entre dos colores "R G B" (1 = iguales, 21 = negro
 * sobre blanco). WCAG AA pide 4.5 para texto normal y 3 para texto grande.
 *
 * Sirve para avisarle al comercio que su combinación no se lee ANTES de que la
 * publique, en vez de que se entere por un cliente que no encontró el botón.
 */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
