import { useCallback, useSyncExternalStore } from 'react';

/**
 * ¿La pantalla cumple esta media query? Se re-renderiza cuando cambia (girar
 * el teléfono, achicar la ventana).
 *
 * Para lo que CSS no alcanza: un listado que en el teléfono se dibuja como
 * tarjetas y en la compu como tabla tiene que montar UNO de los dos. Con
 * `hidden md:block` estarían los dos en el DOM —el doble de inputs, el lector
 * de pantalla leyendo todo dos veces—.
 *
 * Sin matchMedia (tests, render en servidor) responde `false`: la vista de
 * escritorio, que es la que cubren los tests existentes.
 */
function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener?.('change', onChange);
      return () => mql.removeEventListener?.('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  );
}

/**
 * Teléfono: por debajo del breakpoint `md` de Tailwind (768 px). Una tabla de
 * seis columnas en 390 px mostraba Número, Fecha y Cliente, y el total y el
 * estado —lo que se mira primero— quedaban fuera de la pantalla.
 */
const MOBILE_QUERY = '(max-width: 767px)';

/** ¿Es una pantalla de teléfono? Se dibuja una sola de las dos vistas (tabla o tarjetas), no las dos. */
export const useIsMobile = (): boolean => useMediaQuery(MOBILE_QUERY);
