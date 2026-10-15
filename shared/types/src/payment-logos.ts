// Aparte de theme.ts para que el pie de la tienda (en todas las páginas) no
// arrastre el registro de secciones por una lista de logos.

/**
 * Catálogo de logos de medios de pago / bancos disponibles.
 * `slug` = nombre del archivo en /payment-logos/<slug>.webp (servido por
 * storefront y admin desde sus carpetas public). Fuente única para el
 * selector del admin y el render del footer.
 *
 * Son WebP de 240x120 (3x del tamaño al que se dibujan, ~28 px de alto):
 * los SVG originales venían de Canva con un PNG gigante embebido y pesaban
 * 16 MB entre todos. Un test de cada app falla si alguno pasa de 30 KB.
 */
export interface PaymentLogo {
  slug: string;
  label: string;
}
export const PAYMENT_LOGOS: PaymentLogo[] = [
  { slug: 'mercadopago', label: 'Mercado Pago' },
  { slug: 'mercadocredito', label: 'Mercado Crédito' },
  { slug: 'visa', label: 'Visa' },
  { slug: 'mastercard', label: 'Mastercard' },
  { slug: 'american-express', label: 'American Express' },
  { slug: 'cabal', label: 'Cabal' },
  { slug: 'naranja', label: 'Naranja' },
  { slug: 'cordobesa', label: 'Cordobesa' },
  { slug: 'pago-facil', label: 'Pago Fácil' },
  { slug: 'santander', label: 'Santander' },
  { slug: 'galicia', label: 'Galicia' },
  { slug: 'bbva', label: 'BBVA' },
  { slug: 'banco-nacion', label: 'Banco Nación' },
  { slug: 'banco-hipotecario', label: 'Banco Hipotecario' },
  { slug: 'icbc', label: 'ICBC' },
  { slug: 'hsbc', label: 'HSBC' },
  { slug: 'citi', label: 'Citi' },
  { slug: 'cencosud', label: 'Cencosud' },
];
/** Slugs válidos (para filtrar selecciones viejas/erróneas). */
export const PAYMENT_LOGO_SLUGS: string[] = PAYMENT_LOGOS.map((l) => l.slug);
/** Tamaño intrínseco de los archivos: va en width/height del <img> para que
 *  el navegador reserve el lugar antes de bajarlos (sin saltos de layout). */
export const PAYMENT_LOGO_SIZE = { width: 240, height: 120 } as const;
export const paymentLogoSrc = (slug: string): string => `/payment-logos/${slug}.webp`;
/** Nombre legible para el alt: el logo informa con qué se puede pagar. */
export const paymentLogoLabel = (slug: string): string =>
  PAYMENT_LOGOS.find((l) => l.slug === slug)?.label ?? slug;
