import {
  Archivo_Black,
  Barlow,
  Barlow_Condensed,
  Bebas_Neue,
  Cormorant_Garamond,
  DM_Sans,
  DM_Serif_Display,
  Fraunces,
  Inter,
  Lora,
  Manrope,
  Montserrat,
  Playfair_Display,
  Poppins,
  Space_Grotesk,
  Work_Sans,
} from 'next/font/google';

/*
 * Las fuentes que el editor de diseño deja elegir, servidas por la propia
 * tienda (next/font las baja al compilar).
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
const fraunces = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  style: ['normal', 'italic'],
  variable: '--font-fraunces',
});
const poppins = Poppins({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
});
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
});
const montserrat = Montserrat({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-montserrat',
});
const barlow = Barlow({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  weight: ['400', '500', '600', '700'],
  variable: '--font-barlow',
});
const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  weight: ['400', '600', '700'],
  variable: '--font-barlow-condensed',
});
const dmSans = DM_Sans({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  weight: ['400', '500', '700'],
  variable: '--font-dm-sans',
});
const manrope = Manrope({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  weight: ['400', '600', '700'],
  variable: '--font-manrope',
});
const workSans = Work_Sans({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  weight: ['400', '600', '700'],
  variable: '--font-work-sans',
});
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  weight: ['400', '500', '700'],
  variable: '--font-space-grotesk',
});
const playfair = Playfair_Display({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  weight: ['400', '600', '700', '800'],
  variable: '--font-playfair',
});
const lora = Lora({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  weight: ['400', '500', '600', '700'],
  variable: '--font-lora',
});
const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  weight: ['400', '500', '600', '700'],
  variable: '--font-cormorant',
});
const dmSerif = DM_Serif_Display({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  weight: '400',
  variable: '--font-dm-serif',
});
const bebas = Bebas_Neue({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  weight: '400',
  variable: '--font-bebas',
});
const archivoBlack = Archivo_Black({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  weight: '400',
  variable: '--font-archivo-black',
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
