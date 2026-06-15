'use client';

import { createContext, useContext } from 'react';
import type { ThemeConfig } from '@/lib/theme';

/** En modo preview (editor), los links mantienen ?preview=1 para conservar el draft. */
export const PreviewContext = createContext(false);

export function usePreviewHref() {
  const preview = useContext(PreviewContext);
  return (path: string) => (preview ? `${path}${path.includes('?') ? '&' : '?'}preview=1` : path);
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
