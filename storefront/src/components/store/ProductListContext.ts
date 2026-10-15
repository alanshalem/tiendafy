'use client';

import { createContext, useContext } from 'react';
import { DEFAULT_PRODUCT_LIST } from '@tiendafy/types';
import type { ProductListConfig } from '@/lib/theme';

/**
 * Cómo se ven las cards de productos en esta tienda ("Listado de productos"
 * del editor). Lo provee StorefrontView para lo que arma su propia grilla
 * fuera de una sección o del listado: vistos recientemente, lo más vendido
 * de la página de 404 o de una búsqueda sin resultados.
 */
export const ProductListContext = createContext<ProductListConfig | null>(null);

export function useProductListConfig(): ProductListConfig {
  return useContext(ProductListContext) ?? DEFAULT_PRODUCT_LIST;
}
