import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useStore } from '../context/StoreContext';
import { useDebouncedValue } from './useDebouncedValue';

/** Cuántos productos trae cada búsqueda de un selector. */
const RESULTS = 20;

/**
 * Búsqueda de productos para los selectores (campañas, redes, Mercado Libre).
 *
 * Los pickers traían el catálogo COMPLETO recorriendo el cursor de a 100 y
 * filtraban en el navegador. Con miles de productos eso son decenas de requests
 * antes de poder escribir la primera letra, y el resultado igual entra por una
 * lista de veinte. Acá busca la base y vuelven solo los que se van a mostrar.
 */
export function useProductSearch<T>(query: string, options?: { activeOnly?: boolean }) {
  const { store } = useStore();
  const q = useDebouncedValue(query, 300).trim();
  const activeOnly = options?.activeOnly ?? false;

  return useQuery({
    queryKey: ['product-search', store?.id, q, activeOnly],
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(RESULTS), offset: '0' });
      if (q) params.set('q', q);
      if (activeOnly) params.set('status', 'ACTIVE');
      return api.get<{ items: T[]; total: number }>(`/api/v1/products?${params}`);
    },
    enabled: !!store,
    // Mantener lo anterior en pantalla mientras se teclea evita que la lista
    // parpadee a vacío entre letra y letra.
    placeholderData: (previous) => previous,
  });
}

/**
 * Los productos ya elegidos, por id. Un buscador paginado no tiene en memoria
 * lo que se eligió en una búsqueda anterior, y sin esto los chips de
 * seleccionados se quedarían sin nombre.
 *
 * Mientras resuelve una selección nueva conserva la anterior: sin eso, cada
 * vez que se agregaba un producto todos los chips desaparecían un instante.
 * La contracara es que la lista puede traer un elegido que ya se quitó, así
 * que quien la usa muestra lo que dicen SUS ids, no lo que vuelve acá.
 */
export function useProductsByIds<T>(ids: string[]) {
  const { store } = useStore();
  const key = [...ids].sort().join(',');

  return useQuery({
    queryKey: ['products-by-ids', store?.id, key],
    queryFn: () => api.get<{ items: T[] }>(`/api/v1/products?ids=${encodeURIComponent(key)}`),
    enabled: !!store && ids.length > 0,
    placeholderData: (previous) => previous,
  });
}
