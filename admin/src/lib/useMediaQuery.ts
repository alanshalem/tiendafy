import { useSyncExternalStore } from 'react';

/**
 * Celular: por debajo de md (768 px) los listados anchos pasan a tarjetas.
 * Una tabla de seis columnas en 390 px mostraba Número, Fecha y Cliente, y el
 * total y el estado —lo que se mira primero— quedaban fuera de la pantalla.
 */
const NARROW = '(max-width: 767px)';

function subscribe(query: string, onChange: () => void) {
  const mq = window.matchMedia(query);
  mq.addEventListener?.('change', onChange);
  return () => mq.removeEventListener?.('change', onChange);
}

/** Si la consulta de medios se cumple, siguiéndola al girar o achicar la ventana. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => subscribe(query, cb),
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** ¿Pantalla de celular? Se dibuja una sola de las dos vistas (tabla o tarjetas), no las dos. */
export const useIsNarrow = () => useMediaQuery(NARROW);
