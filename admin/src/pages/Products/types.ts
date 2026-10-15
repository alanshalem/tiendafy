import type { BadgeVariant } from '@tiendafy/ui';

/**
 * Tipos y mapas compartidos por las páginas de Productos (lista, edición,
 * inventario): antes duplicados en cada archivo.
 */
export type { StockItem } from '../../lib/products';

export type ProductStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export type { Category } from '../../lib/useCategories';

export const statusVariant: Record<ProductStatus, BadgeVariant> = {
  ACTIVE: 'success',
  DRAFT: 'neutral',
  ARCHIVED: 'warning',
};

export const statusLabel: Record<ProductStatus, string> = {
  ACTIVE: 'Publicado',
  DRAFT: 'Borrador',
  ARCHIVED: 'Archivado',
};
