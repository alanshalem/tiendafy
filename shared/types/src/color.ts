/**
 * Helpers de color compartidos (storefront + admin).
 *
 * Los colores del tema se guardan como canal RGB crudo "R G B" (para alpha de
 * Tailwind); este helper vivía duplicado en `theme-editor-inputs` (contrastText)
 * y `lib/theme` (contrastFg) con la misma fórmula de luminancia.
 */

const TEXTO_OSCURO = '17 24 39';
const TEXTO_CLARO = '255 255 255';

/**
 * Texto legible (oscuro o blanco) sobre un color de fondo "R G B": se queda con
 * el que MÁS contrasta, medido con la fórmula de WCAG.
 *
 * Antes comparaba una luminancia aproximada contra un umbral fijo, y con los
 * colores de luminancia media —naranjas, ámbar, teal, lima— elegía blanco
 * cuando el oscuro contrastaba el doble. Un naranja de marca (#FF6A1A) daba
 * blanco a 2.9:1, abajo del mínimo de 4.5:1 que pide WCAG AA, mientras que el
 * oscuro llegaba a 6.2:1. El botón de comprar de esa tienda no se leía.
 */
export function contrastText(rgbRaw: string): string {
  return contrastRatio(TEXTO_OSCURO, rgbRaw) >= contrastRatio(TEXTO_CLARO, rgbRaw)
    ? TEXTO_OSCURO
    : TEXTO_CLARO;
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
