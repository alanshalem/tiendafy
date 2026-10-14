/**
 * Después de un deploy, una pestaña abierta de antes pide chunks que ya no
 * existen ("Failed to fetch dynamically imported module"). Vite avisa con el
 * evento `vite:preloadError`: se recarga la página una vez y se trae la
 * versión nueva, sin que el comercio vea un error.
 *
 * "Una vez": si el chunk sigue sin aparecer después de recargar (el deploy
 * quedó a medias, un proxy cacheó mal), recargar de nuevo sería un bucle. En
 * ese caso el error sigue de largo y lo muestra la barrera de la pantalla.
 */
const KEY = 'tf-stale-chunk-reload-at';
const WINDOW_MS = 60_000;

export function reloadOnceForStaleChunk(
  reload: () => void = () => window.location.reload(),
  now: number = Date.now(),
): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (last && now - last < WINDOW_MS) return false;
    sessionStorage.setItem(KEY, String(now));
  } catch {
    // Sin sessionStorage no hay cómo saber si ya se recargó: mejor no arriesgar un bucle.
    return false;
  }
  reload();
  return true;
}

export function installStaleChunkReload(target: Window = window) {
  target.addEventListener('vite:preloadError', (event) => {
    // preventDefault: que Vite no tire el error mientras la página se recarga.
    if (reloadOnceForStaleChunk()) event.preventDefault();
  });
}
