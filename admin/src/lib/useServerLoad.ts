import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Pide algo al servidor cada vez que cambia `key` (la tienda activa, un id,
 * un filtro) y le pasa la respuesta a `onData` —o el error a `onError`—.
 *
 * Es el "cargar al entrar" de las pantallas que después editan lo que
 * cargaron (por eso no es una query de React Query: la respuesta se copia a
 * un formulario). Lo que resuelve, que a mano se repetía mal en cada una:
 *
 * - la respuesta de un pedido viejo (se cambió de tienda a mitad de camino)
 *   se descarta: no pisa a la nueva;
 * - "cargando" se deriva —es que la última respuesta no es de esta `key`—
 *   en vez de prenderse con un setState dentro del efecto;
 * - `reload` vuelve a pedir después de una acción, con su "cargando".
 *
 * `key` null = todavía no hay qué pedir (sin tienda): no pide y no carga.
 */
export function useServerLoad<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  onData: (data: T) => void,
  onError?: (error: unknown) => void,
) {
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  // Siempre las funciones del último render: leen el estado de ese momento.
  const latest = useRef({ key, fetcher, onData, onError });
  useLayoutEffect(() => {
    latest.current = { key, fetcher, onData, onError };
  });

  useEffect(() => {
    if (key === null) return;
    let current = true;
    latest.current.fetcher().then(
      (data) => {
        if (!current) return;
        latest.current.onData(data);
        setLoadedFor(key);
      },
      (error: unknown) => {
        if (!current) return;
        latest.current.onError?.(error);
        setLoadedFor(key);
      },
    );
    return () => {
      current = false;
    };
  }, [key]);

  const reload = useCallback(async () => {
    const { key: forKey, fetcher: fetchNow } = latest.current;
    setLoadedFor(null);
    try {
      latest.current.onData(await fetchNow());
    } catch (error) {
      latest.current.onError?.(error);
    } finally {
      setLoadedFor(forKey);
    }
  }, []);

  return { loading: key !== null && loadedFor !== key, reload };
}
