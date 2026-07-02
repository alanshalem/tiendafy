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
