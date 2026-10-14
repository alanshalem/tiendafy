'use client';

import { createContext, useContext } from 'react';
import type { StoreProduct } from './ProductCard';

/**
 * Los productos de cada sección de la portada, ya resueltos según su origen
 * (lib/section-products), por id de sección. Lo provee StorefrontView: en la
 * tienda llega del servidor y en la vista previa se actualiza cuando el
 * editor cambia el origen de una sección.
 */
export const SectionProductsContext = createContext<Record<string, StoreProduct[]>>({});

/**
 * Lo que muestra una sección de productos. undefined si todavía no se
 * resolvió (o la API no respondió): el renderer usa entonces su respaldo.
 */
export function useSectionProducts(sectionId: string): StoreProduct[] | undefined {
  return useContext(SectionProductsContext)[sectionId];
}
