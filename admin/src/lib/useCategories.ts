import { useQuery, type QueryMeta } from '@tanstack/react-query';
import { useStore } from '../context/StoreContext';
import { api } from './api';
import { qk } from './queryKeys';

/** Una categoría de la tienda (`GET /categories`). */
export interface Category {
  id: string;
  name: string;
  slug?: string;
  /** Null o ausente: es de primer nivel (el padre también se deduce del path). */
  parentId?: string | null;
  /** Los slugs desde la raíz: 'deportes/pesas'. */
  path: string;
  /** 1 = primer nivel. */
  depth: number;
}

export interface CategoriesResponse {
  items: Category[];
}

/**
 * Las categorías de la tienda activa. Una sola consulta para todo el panel
 * (Categorías, Productos, Costos, el selector de links, las secciones del
 * editor…): misma clave, así la segunda pantalla sale de la caché.
 */
export function useCategories<T = CategoriesResponse>({
  enabled = true,
  meta,
  select,
}: {
  /** Pedirlas recién cuando hacen falta (p. ej. el tab de categorías abierto). */
  enabled?: boolean;
  meta?: QueryMeta;
  select?: (data: CategoriesResponse) => T;
} = {}) {
  const { store } = useStore();
  return useQuery({
    queryKey: qk.categories(store?.id),
    queryFn: () => api.get<CategoriesResponse>('/api/v1/categories'),
    enabled: enabled && !!store,
    meta,
    select,
  });
}
