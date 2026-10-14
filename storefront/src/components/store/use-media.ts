'use client';

import { useSyncExternalStore } from 'react';

/*
 * Preferencias del dispositivo que cambian qué se mueve y qué se baja en la
 * portada (carrusel, video, marcas). Con useSyncExternalStore y no con un
 * efecto: el servidor no las conoce (da `false`) y en el navegador se leen
 * al hidratar sin un render de más ni un salto.
 */

const noop = () => () => {};

function subscribeMedia(query: string) {
  return (onChange: () => void) => {
    if (typeof window === 'undefined' || !window.matchMedia) return () => {};
    const mql = window.matchMedia(query);
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  };
}

const matches = (query: string) => () =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches;

/** ¿La pantalla cumple la media query? En el servidor, `false`. */
export function useMediaQuery(query: string): boolean {
  // Una suscripción por query; las funciones se rearman solo si cambia.
  const [subscribe, get] = cached(query);
  return useSyncExternalStore(subscribe, get, () => false);
}
const cache = new Map<string, [ReturnType<typeof subscribeMedia>, () => boolean]>();
function cached(query: string) {
  let entry = cache.get(query);
  if (!entry) cache.set(query, (entry = [subscribeMedia(query), matches(query)]));
  return entry;
}

const getTrue = () => true;
const getFalse = () => false;
/** `false` en el servidor y al hidratar; `true` después. Para lo que el HTML del servidor no debe traer. */
export function useHydrated(): boolean {
  return useSyncExternalStore(noop, getTrue, getFalse);
}

const REDUCED = '(prefers-reduced-motion: reduce)';
const subscribeReduced = subscribeMedia(REDUCED);
const getReduced = matches(REDUCED);

/** El sistema pide menos movimiento: nada arranca a moverse solo. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduced, getReduced, () => false);
}

interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
}

const getSaveData = () => {
  if (typeof navigator === 'undefined') return false;
  const conn = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  // "Ahorro de datos" prendido, o una conexión 2G: un video de fondo de varios
  // MB es lo último que hace falta bajar.
  return !!conn && (conn.saveData === true || /(^|-)2g$/.test(conn.effectiveType ?? ''));
};

/** El usuario pidió ahorrar datos (o la conexión es muy lenta). */
export function useSaveData(): boolean {
  return useSyncExternalStore(noop, getSaveData, () => false);
}
