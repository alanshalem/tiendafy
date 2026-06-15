import type { IsoDateTime, Money } from './common';

/** Modelo Shopify-style: Product → Options → Variants (matriz talle×color). */
export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: ProductStatus;
  options: ProductOption[];
  variants: Variant[];
  images: ProductImage[];
  categoryIds: string[];
  /** Metafields custom del merchant (JSONB en backend). */
  metafields: Record<string, unknown>;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export type ProductStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export interface ProductOption {
  id: string;
  name: string; // "Talle", "Color"
  values: string[]; // ["S", "M", "L"]
}

export interface Variant {
  id: string;
  sku: string;
  /** Valores de opción en orden: ["M", "Rojo"]. */
  optionValues: string[];
  price: Money;
  compareAtPrice: Money | null;
  available: number;
  imageId: string | null;
}

export interface ProductImage {
  id: string;
  url: string;
  altText: string | null;
  position: number;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  /** Path materializado: "ropa/remeras". */
  path: string;
}
