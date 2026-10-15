import type { CSSProperties, ReactNode } from 'react';
import { sanitizeCss } from '@tiendafy/types';
import type { ThemeConfig } from '@/lib/theme';
import { themeToStyle } from '@/lib/theme-style';

/** Adonde lleva "Saltar al contenido": lo que hay entre el encabezado y el pie. */
export const CONTENT_ID = 'contenido';

/**
 * La raíz de la tienda: las variables del tema (colores, tipografías,
 * botones) y el CSS propio del comercio. Sin hooks: en la tienda publicada la
 * dibuja el servidor; en la vista previa, LiveStorefront con el tema que
 * llega del editor.
 */
export function StoreRoot({ theme, children }: { theme: ThemeConfig; children: ReactNode }) {
  return (
    <div
      data-store-radius={theme.borderRadius}
      data-store-motion={theme.motion}
      data-store-density={theme.density}
      style={themeToStyle(theme) as CSSProperties}
    >
      {/* sanitizeCss también acá: el theme puede venir del postMessage live (no pasó por el backend). */}
      {theme.customCss && <style dangerouslySetInnerHTML={{ __html: sanitizeCss(theme.customCss) }} />}
      {children}
    </div>
  );
}

/**
 * Lo primero que alcanza el Tab: con teclado o lector de pantalla, saltea la
 * barra de anuncio y el menú entero (invisible hasta tener foco).
 */
export function SkipLink() {
  return (
    <a
      href={`#${CONTENT_ID}`}
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-primary-fg focus:shadow-lg"
    >
      Saltar al contenido
    </a>
  );
}
