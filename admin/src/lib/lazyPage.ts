import { lazy, type ComponentType } from 'react';

const loaders: Array<() => Promise<unknown>> = [];

/**
 * Una pantalla que se baja recién cuando se abre.
 *
 * Antes el panel entero era un solo archivo de 1,4 MB (400 KB comprimido):
 * para ver el inicio había que bajar también el editor de facturas, las
 * estadísticas y el escáner. Ahora cada pantalla es su propio archivo.
 * `name` es el export de la pantalla dentro de su módulo.
 */
export function lazyPage<M, K extends keyof M>(load: () => Promise<M>, name: K) {
  loaders.push(load);
  return lazy(() => load().then((m) => ({ default: m[name] as unknown as ComponentType })));
}

/**
 * Baja todas las pantallas de una vez. Lo usan los tests, para que un import
 * lento no se confunda con una pantalla que no aparece.
 */
export function preloadPages() {
  return Promise.all(loaders.map((load) => load()));
}
