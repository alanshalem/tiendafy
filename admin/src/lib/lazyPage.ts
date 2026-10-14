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
 * Una pieza pesada que no es una pantalla (un modal, el editor de texto) y
 * se baja recién cuando se dibuja. Queda anotada igual que las pantallas, así
 * los tests la bajan de antemano.
 */
export function lazyComponent<P extends object>(load: () => Promise<ComponentType<P>>) {
  loaders.push(load);
  return lazy(() => load().then((component) => ({ default: component })));
}

/**
 * Baja todas las pantallas y piezas de una vez. Lo usan los tests, para que
 * un import lento no se confunda con una pantalla que no aparece. Va en
 * vueltas porque una pieza se anota recién cuando se baja la pantalla que la
 * usa (el modal de campañas, al bajar Marketing).
 */
export async function preloadPages() {
  let done = 0;
  while (done < loaders.length) {
    const pending = loaders.slice(done);
    done = loaders.length;
    await Promise.all(pending.map((load) => load()));
  }
}
