'use client';

import { createContext, useContext } from 'react';
import { useSearchParams } from 'next/navigation';
import type { ThemeConfig } from '@/lib/theme';

/** En modo preview (editor), los links mantienen ?preview=1 para conservar el draft. */
export const PreviewContext = createContext(false);

/**
 * Origin del panel admin (el único par legítimo del postMessage del editor).
 * Se usa como targetOrigin al emitir y para validar e.origin al recibir —
 * nunca '*': un sitio malicioso que embeba el preview no debe poder inyectar
 * un theme ni recibir mensajes.
 */
export const ADMIN_ORIGIN = process.env.NEXT_PUBLIC_ADMIN_ORIGIN ?? 'http://localhost:3001';

export function usePreviewHref() {
  const preview = useContext(PreviewContext);
  // useSearchParams (y no window.location): da el MISMO valor en el SSR y en la
  // hidratación — leer window acá rompía la hidratación de todos los links del
  // preview (server sin ?pt, cliente con ?pt).
  const pt = useSearchParams().get('pt');
  return (path: string) => {
    if (!preview) return path;
    // Mantener también el token de preview (?pt=…): las páginas internas del
    // preview (productos, contacto…) lo necesitan para leer el draft en el SSR.
    let qs = 'preview=1';
    if (pt) qs += `&pt=${encodeURIComponent(pt)}`;
    return `${path}${path.includes('?') ? '&' : '?'}${qs}`;
  };
}

/**
 * Theme "en vivo" del editor. StorefrontView (modo live) lo provee desde su
 * estado, que se actualiza por postMessage. Los componentes de página
 * (ProductDetail, CatalogBrowser, etc.) lo prefieren sobre el theme del server
 * para reflejar cambios al instante sin recargar el iframe. Null fuera de live.
 */
export const LiveThemeContext = createContext<ThemeConfig | null>(null);
export function useLiveTheme(): ThemeConfig | null {
  return useContext(LiveThemeContext);
}
