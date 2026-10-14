import { QueryClient, type Query } from '@tanstack/react-query';
import { ApiRequestError } from './api';

/**
 * Un reintento para un corte momentáneo; 401 (sesión vencida) y 403 (sin
 * permiso) no cambian por insistir: antes se pedían dos veces.
 */
export function shouldRetry(failures: number, error: unknown): boolean {
  return (
    failures < 1 && !(error instanceof ApiRequestError && (error.status === 401 || error.status === 403))
  );
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry, refetchOnWindowFocus: false },
    },
  });
}

/**
 * La red de contención de las cargas que fallan: si la pantalla no lo
 * muestra (no tiene su LoadError, `meta.errorShown`), o si lo que falló fue
 * una recarga en segundo plano y la pantalla sigue mostrando lo viejo, hay
 * que avisar. Antes un error de carga en la mayoría de las pantallas se veía
 * como "no hay datos".
 *
 * Quedan afuera los errores que dicen algo del dominio y ya tienen su
 * pantalla: 401 (se pide la clave encima), 403 (sin permiso) y 404 (no
 * existe / no está configurado).
 */
export function loadFailureMessage(query: Query, error: unknown): string | null {
  if (error instanceof ApiRequestError && [401, 403, 404].includes(error.status)) return null;
  const hasData = query.state.data !== undefined;
  if (hasData) return 'No se pudieron actualizar los datos: lo que ves puede estar desactualizado.';
  if (query.meta?.errorShown) return null;
  return 'No se pudieron cargar algunos datos. Revisá la conexión y recargá la pantalla; no es que estén vacíos.';
}
