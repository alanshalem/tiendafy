import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Archivo, Fraunces } from 'next/font/google';
import './globals.css';
import { serverRuntimeConfig } from '@/lib/runtime';

// Fuentes de la landing de plataforma. Los storefronts de tenants usan
// los tokens del design system; estas variables solo las consume .ld-root.
const fraunces = Fraunces({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-fraunces',
});

const archivo = Archivo({
  subsets: ['latin'],
  variable: '--font-archivo',
});

export const metadata: Metadata = {
  title: 'Tiendafy',
  description: 'Tu tienda online',
};

// Fuentes elegibles del editor de diseño. Se cargan vía Google Fonts: el
// navegador solo descarga la familia que la tienda realmente usa.
const STORE_FONTS_HREF =
  'https://fonts.googleapis.com/css2' +
  '?family=Poppins:wght@400;500;600;700' +
  '&family=Montserrat:wght@400;500;600;700' +
  '&family=DM+Sans:wght@400;500;700' +
  '&family=Manrope:wght@400;600;700' +
  '&family=Work+Sans:wght@400;600;700' +
  '&family=Space+Grotesk:wght@400;500;700' +
  '&family=Playfair+Display:wght@400;600;700;800' +
  '&family=Lora:wght@400;500;600;700' +
  '&family=Cormorant+Garamond:wght@400;500;600;700' +
  '&family=DM+Serif+Display' +
  '&family=Bebas+Neue' +
  '&family=Archivo+Black' +
  '&display=swap';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <head>
        {/* Config de runtime: va PRIMERO, antes de cualquier bundle, porque el
            cliente la lee al inicializar. Es lo que permite promover la misma
            imagen de staging a producción sin recompilar. */}
        <script
          id="tiendafy-runtime-config"
          dangerouslySetInnerHTML={{
            __html: `window.__TIENDAFY_CONFIG__=${JSON.stringify(serverRuntimeConfig())}`,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={STORE_FONTS_HREF} />
      </head>
      <body className={`${fraunces.variable} ${archivo.variable} min-h-screen antialiased`}>{children}</body>
    </html>
  );
}
