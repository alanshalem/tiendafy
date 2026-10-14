import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { serverRuntimeConfig } from '@/lib/runtime';
import { resolveTenant } from '@/lib/tenancy';
import { fetchPublishedTheme } from '@/lib/theme';
import { StoreCategories } from '@/components/store/StoreCategories';
import { storeFontVariables } from './store-fonts';

/** El ícono de Tiendafy, para la tienda que no subió el suyo. */
const DEFAULT_ICON = '/icon.svg';

/**
 * Lo que comparten todas las páginas de la tienda: la plantilla del título
 * ("Contacto · Mi Tienda"), la descripción por defecto y el ícono de la
 * pestaña. Antes el layout decía "Tienda online" fijo, y toda página que no
 * armaba su metadata (contacto, checkout, la cuenta…) salía con ese título
 * en Google y en la pestaña.
 *
 * El favicon de la tienda va acá, en el HTML del servidor: antes lo ponía un
 * efecto del lado del cliente, y Google (que no espera al JS para el ícono)
 * mostraba siempre el de Tiendafy. Por eso el ícono por defecto ya no es
 * app/icon.svg —la convención de archivo le gana a la metadata y no dejaba
 * poner otro— sino public/icon.svg.
 *
 * La tienda y el diseño salen de la Data Cache (ver tenancy/theme): esto no
 * suma pedidos a la API.
 */
export async function generateMetadata(): Promise<Metadata> {
  const tenant = await resolveTenant().catch(() => null);
  if (!tenant) {
    return { title: 'Tienda online', description: 'Tu tienda online', icons: { icon: DEFAULT_ICON } };
  }
  const theme = await fetchPublishedTheme(tenant.id).catch(() => null);
  return {
    title: { template: `%s · ${tenant.name}`, default: tenant.name },
    description: theme?.seoDescription?.trim() || `Comprá online en ${tenant.name}.`,
    icons: { icon: theme?.favicon || DEFAULT_ICON },
  };
}

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
      <body className={`${storeFontVariables} min-h-screen antialiased`}>
        <StoreCategories>{children}</StoreCategories>
      </body>
    </html>
  );
}
