'use client';

import { useEffect } from 'react';

/**
 * Las páginas que se abren con un token en la URL: el link de activación
 * (elige la contraseña y abre la sesión), el de "olvidé mi contraseña", el
 * seguimiento de un pedido sin cuenta y la invitación a opinar. Quien tenga
 * esa URL entra a la cuenta o ve la compra.
 *
 * Por eso, en estas páginas: la medición de terceros (GA4, Meta, Clarity) no
 * se carga —mandan la URL completa y Clarity graba la sesión— y la página saca
 * el token de la barra de direcciones apenas lo lee (ver useScrubUrlParams).
 */
export const TOKEN_PAGES: Record<string, readonly string[]> = {
  '/cuenta/verificar': ['token'],
  '/cuenta/reset': ['token'],
  '/seguimiento': ['t'],
  '/resenas/escribir': ['t'],
};

export const isTokenPage = (pathname: string) => Object.hasOwn(TOKEN_PAGES, pathname);

/**
 * Saca de la URL actual los parámetros nombrados, sin recargar ni sumar una
 * entrada al historial. Next sincroniza replaceState con su router
 * (useSearchParams deja de verlos): quien los necesite tiene que haberlos
 * guardado antes (por ejemplo, en el estado inicial de un useState).
 */
export function scrubUrlParams(names: readonly string[]) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  let changed = false;
  for (const name of names) {
    if (url.searchParams.has(name)) {
      url.searchParams.delete(name);
      changed = true;
    }
  }
  if (!changed) return;
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

/**
 * Al montar, saca los tokens de la URL: así no quedan en el historial, ni en
 * el Referer de lo que se pida desde la página, ni en la URL que mida una
 * herramienta que ya estuviera cargada.
 */
export function useScrubUrlParams(names: readonly string[]) {
  const key = names.join(',');
  useEffect(() => {
    scrubUrlParams(key.split(','));
  }, [key]);
}
