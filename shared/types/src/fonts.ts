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
  { value: 'inter', label: 'Inter' },
  { value: 'montserrat', label: 'Montserrat' },
  { value: 'barlow', label: 'Barlow' },
  { value: 'barlowcondensed', label: 'Barlow Condensed' },
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

/**
 * Familia CSS de cada fuente del catálogo. Estaba copiada en el panel (para
 * previsualizar) y en la tienda (para renderizar): agregar una fuente al
 * catálogo y olvidar una de las dos copias dejaba al comerciante eligiendo una
 * tipografía que su tienda no aplicaba.
 *
 * La tienda pisa `sans`, `display` y `mono` con las variables de sus fuentes
 * ya cargadas; el resto es idéntico en las dos apps.
 */
export const FONT_FAMILY_CSS: Record<FontOptionValue, string> = {
  sans: 'ui-sans-serif, system-ui, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  display: 'Georgia, serif',
  mono: 'ui-monospace, monospace',
  poppins: "'Poppins', sans-serif",
  inter: "'Inter', sans-serif",
  montserrat: "'Montserrat', sans-serif",
  barlow: "'Barlow', sans-serif",
  // Condensada: entra mucha ficha técnica y mucho precio en poco ancho.
  barlowcondensed: "'Barlow Condensed', 'Barlow', sans-serif",
  dmsans: "'DM Sans', sans-serif",
  manrope: "'Manrope', sans-serif",
  worksans: "'Work Sans', sans-serif",
  spacegrotesk: "'Space Grotesk', sans-serif",
  playfair: "'Playfair Display', serif",
  lora: "'Lora', serif",
  cormorant: "'Cormorant Garamond', serif",
  dmserif: "'DM Serif Display', serif",
  bebas: "'Bebas Neue', sans-serif",
  archivoblack: "'Archivo Black', sans-serif",
};
