import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { serverRuntimeConfig } from '@/lib/runtime';
import { storeFontVariables } from './store-fonts';

// Título de respaldo: cada tienda define el suyo en generateMetadata. Este se
// ve solo si una ruta no genera metadata propia.
export const metadata: Metadata = {
  title: 'Tienda online',
  description: 'Tu tienda online',
};

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
      </head>
      {/* Las fuentes del editor de diseño, servidas por la tienda (ver store-fonts). */}
      <body className={`${storeFontVariables} min-h-screen antialiased`}>{children}</body>
    </html>
  );
}
