import { useQuery } from '@tanstack/react-query';
import { useStore } from '../../context/StoreContext';
import { fetchStockChunked, type StockItem } from '../../lib/products';
import { api } from '../../lib/api';

/**
 * Helpers de react-query compartidos por las páginas de Productos
 * (antes copiados entre lista/inventario y las tabs de importación).
 */

/** Stock por variante de todos los productos dados, como Map variantId → item. */
export function useVariantStock(products: { variants: { id: string }[] }[]): Map<string, StockItem> {
  const { store } = useStore();
  const variantIds = products.flatMap((p) => p.variants.map((v) => v.id));
  const { data: stock } = useQuery({
    // La clave lleva los IDs (no la cantidad): dos búsquedas con el mismo
    // total de variantes son consultas DISTINTAS y deben refetchear.
    queryKey: ['inventory', store?.id, variantIds.join(',')],
    queryFn: () => fetchStockChunked(variantIds),
    enabled: !!store && variantIds.length > 0,
  });
  return new Map((stock ?? []).map((s) => [s.variantId, s]));
}

/** refetchInterval de jobs de importación: 800ms hasta completed/failed. */
export const pollWhileRunning = (query: { state: { data?: { status: string } } }) => {
  const s = query.state.data?.status;
  return s === 'completed' || s === 'failed' ? false : 800;
};

/** Estado de completitud del catálogo (`GET /products/health`). */
export interface CatalogHealth {
  total: number;
  published: number;
  draft: number;
  archived: number;
  withoutImage: number;
  variants: number;
  variantsWithCost: number;
  variantsWithoutCost: number;
  averageMarginPct: number;
  lowMarginVariants: number;
}

/**
 * Una sola consulta para las dos pantallas que la usan (Productos y Costos):
 * mismo `queryKey`, así la segunda sale de la caché.
 */
export function useCatalogHealth(enabled = true) {
  const { store } = useStore();
  return useQuery({
    queryKey: ['catalog-health', store?.id],
    queryFn: () => api.get<CatalogHealth>('/api/v1/products/health'),
    enabled: !!store && enabled,
  });
}
