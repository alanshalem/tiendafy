import localFont from 'next/font/local';

/*
 * Las fuentes que el editor de diseño deja elegir, servidas por la propia
 * tienda. Los archivos están en ./fonts (subconjunto latin de Google Fonts,
 * licencia SIL OFL 1.1) y este archivo lo genera scripts/fetch-store-fonts.mjs:
 * no editarlo a mano.
 *
 * Antes venían de una hoja de estilos de Google con las quince familias: un
 * pedido a otro dominio que frenaba el primer pintado de cada página, y además
 * Fraunces se precargaba siempre (81 KB) aunque la tienda no la usara. Ahora
 * ninguna se precarga: el navegador baja solo la que el tema aplica, cuando la
 * aplica, desde el mismo dominio.
 *
 * Cada una queda en una variable CSS (--font-<nombre>) que lib/theme usa al
 * armar --font-heading y --font-body.
 */
// next/font exige una const por fuente, con las opciones escritas literal.
const fraunces = localFont({
  src: [
    { path: './fonts/fraunces-italic-100-900.woff2', weight: '100 900', style: 'italic' },
    { path: './fonts/fraunces-100-900.woff2', weight: '100 900', style: 'normal' },
  ],
  display: 'swap',
  preload: false,
  variable: '--font-fraunces',
  adjustFontFallback: 'Times New Roman',
});
const poppins = localFont({
  src: [
    { path: './fonts/poppins-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/poppins-500.woff2', weight: '500', style: 'normal' },
    { path: './fonts/poppins-600.woff2', weight: '600', style: 'normal' },
    { path: './fonts/poppins-700.woff2', weight: '700', style: 'normal' },
  ],
  display: 'swap',
  preload: false,
  variable: '--font-poppins',
  adjustFontFallback: 'Arial',
});
const inter = localFont({
  src: [{ path: './fonts/inter-400-700.woff2', weight: '400 700', style: 'normal' }],
  display: 'swap',
  preload: false,
  variable: '--font-inter',
  adjustFontFallback: 'Arial',
});
const montserrat = localFont({
  src: [{ path: './fonts/montserrat-400-900.woff2', weight: '400 900', style: 'normal' }],
  display: 'swap',
  preload: false,
  variable: '--font-montserrat',
  adjustFontFallback: 'Arial',
});
const barlow = localFont({
  src: [
    { path: './fonts/barlow-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/barlow-500.woff2', weight: '500', style: 'normal' },
    { path: './fonts/barlow-600.woff2', weight: '600', style: 'normal' },
    { path: './fonts/barlow-700.woff2', weight: '700', style: 'normal' },
  ],
  display: 'swap',
  preload: false,
  variable: '--font-barlow',
  adjustFontFallback: 'Arial',
});
const barlowCondensed = localFont({
  src: [
    { path: './fonts/barlow-condensed-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/barlow-condensed-600.woff2', weight: '600', style: 'normal' },
    { path: './fonts/barlow-condensed-700.woff2', weight: '700', style: 'normal' },
  ],
  display: 'swap',
  preload: false,
  variable: '--font-barlow-condensed',
  adjustFontFallback: 'Arial',
});
const dmSans = localFont({
  src: [{ path: './fonts/dm-sans-400-700.woff2', weight: '400 700', style: 'normal' }],
  display: 'swap',
  preload: false,
  variable: '--font-dm-sans',
  adjustFontFallback: 'Arial',
});
const manrope = localFont({
  src: [{ path: './fonts/manrope-400-700.woff2', weight: '400 700', style: 'normal' }],
  display: 'swap',
  preload: false,
  variable: '--font-manrope',
  adjustFontFallback: 'Arial',
});
const workSans = localFont({
  src: [{ path: './fonts/work-sans-400-700.woff2', weight: '400 700', style: 'normal' }],
  display: 'swap',
  preload: false,
  variable: '--font-work-sans',
  adjustFontFallback: 'Arial',
});
const spaceGrotesk = localFont({
  src: [{ path: './fonts/space-grotesk-400-700.woff2', weight: '400 700', style: 'normal' }],
  display: 'swap',
  preload: false,
  variable: '--font-space-grotesk',
  adjustFontFallback: 'Arial',
});
const playfair = localFont({
  src: [{ path: './fonts/playfair-display-400-800.woff2', weight: '400 800', style: 'normal' }],
  display: 'swap',
  preload: false,
  variable: '--font-playfair',
  adjustFontFallback: 'Times New Roman',
});
const lora = localFont({
  src: [{ path: './fonts/lora-400-700.woff2', weight: '400 700', style: 'normal' }],
  display: 'swap',
  preload: false,
  variable: '--font-lora',
  adjustFontFallback: 'Times New Roman',
});
const cormorant = localFont({
  src: [{ path: './fonts/cormorant-garamond-400-700.woff2', weight: '400 700', style: 'normal' }],
  display: 'swap',
  preload: false,
  variable: '--font-cormorant',
  adjustFontFallback: 'Times New Roman',
});
const dmSerif = localFont({
  src: [{ path: './fonts/dm-serif-display-400.woff2', weight: '400', style: 'normal' }],
  display: 'swap',
  preload: false,
  variable: '--font-dm-serif',
  adjustFontFallback: 'Times New Roman',
});
const bebas = localFont({
  src: [{ path: './fonts/bebas-neue-400.woff2', weight: '400', style: 'normal' }],
  display: 'swap',
  preload: false,
  variable: '--font-bebas',
  adjustFontFallback: 'Arial',
});
const archivoBlack = localFont({
  src: [{ path: './fonts/archivo-black-400.woff2', weight: '400', style: 'normal' }],
  display: 'swap',
  preload: false,
  variable: '--font-archivo-black',
  adjustFontFallback: 'Arial',
});

const fonts = [
  fraunces,
  poppins,
  inter,
  montserrat,
  barlow,
  barlowCondensed,
  dmSans,
  manrope,
  workSans,
  spaceGrotesk,
  playfair,
  lora,
  cormorant,
  dmSerif,
  bebas,
  archivoBlack,
];

/** Las clases que declaran las variables de todas las fuentes (van en <body>). */
export const storeFontVariables = fonts.map((f) => f.variable).join(' ');
