/**
 * Catálogo de fuentes ofrecidas en el editor de diseño (fuente única
 * compartida por el admin y el storefront). Antes duplicado byte-a-byte
 * como `fontOptions` en `ThemeEditor` y `lib/theme`.
 */
export const FONT_OPTIONS = [
  { value: 'sans', label: 'Sans (moderna)' },
  { value: 'serif', label: 'Serif (clásica)' },
  { value: 'display', label: 'Display (con carácter)' },
  { value: 'mono', label: 'Mono (técnica)' },
  { value: 'poppins', label: 'Poppins' },
  { value: 'montserrat', label: 'Montserrat' },
  { value: 'dmsans', label: 'DM Sans' },
  { value: 'manrope', label: 'Manrope' },
  { value: 'worksans', label: 'Work Sans' },
  { value: 'spacegrotesk', label: 'Space Grotesk' },
  { value: 'playfair', label: 'Playfair Display' },
  { value: 'lora', label: 'Lora' },
  { value: 'cormorant', label: 'Cormorant' },
  { value: 'dmserif', label: 'DM Serif Display' },
  { value: 'bebas', label: 'Bebas Neue' },
  { value: 'archivoblack', label: 'Archivo Black' },
] as const;

/** Valor (`value`) de una fuente del catálogo, p.ej. 'sans' | 'poppins' | … */
export type FontOptionValue = (typeof FONT_OPTIONS)[number]['value'];
