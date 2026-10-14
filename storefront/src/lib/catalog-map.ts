import { type MoneyDto } from '@tiendafy/types';
import type { StoreProduct } from '@/components/store/sections';

/**
 * Tipos del catálogo y mappers PUROS (DTO → modelo de la tienda). Viven aparte
 * de catalog.ts porque ese módulo importa lib/api (server-only): sin esta
 * separación, el cliente arrastraba el fetcher del servidor solo para mapear
 * — y por eso `referencedProductIds` estaba duplicado a mano en StorefrontView.
 */
export interface VariantDto {
  id: string;
  sku: string;
  optionValues: string[];
  price: MoneyDto;
  compareAtPrice: MoneyDto | null;
  /** Unidades de la variante (solo la ficha del storefront lo trae). */
  available?: number | null;
}

interface ProductImageDto {
  id: string;
  url: string;
  altText: string | null;
  position: number;
}

export interface ProductDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  brand: string | null;
  variants: VariantDto[];
  images: ProductImageDto[];
  stock: number | null;
}

export function toStoreProduct(p: ProductDto): StoreProduct | null {
  const v = p.variants[0];
  if (!v) return null;
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    priceAmount: v.price.amount,
    currency: v.price.currency,
    compareAtAmount: v.compareAtPrice?.amount ?? null,
    image: p.images[0]?.url ?? null,
    images: p.images.map((img) => img.url),
    // La card agrega al carrito la primera variante: solo vale si es la única.
    // Con más, el botón lleva a la ficha a elegir (ver ProductCard).
    variantId: v.id,
    variantLabel: v.optionValues.length > 0 ? v.optionValues.join(' / ') : 'Única',
    variantCount: p.variants.length,
    stock: p.stock ?? null,
  };
}

/** Ids de producto referenciados por las secciones del home (destacados/ofertas). */
export function referencedProductIds(sections: { data: unknown }[]): string[] {
  const referenced = new Set<string>();
  for (const s of sections) {
    const ids = (s.data as { productIds?: unknown }).productIds;
    if (Array.isArray(ids)) ids.forEach((id) => typeof id === 'string' && referenced.add(id));
  }
  return [...referenced];
}

/** DTOs (posiblemente null) → StoreProduct, descartando inválidos. */
export function toStoreProducts(dtos: (ProductDto | null)[]): StoreProduct[] {
  return dtos.map((d) => (d ? toStoreProduct(d) : null)).filter((p): p is StoreProduct => p !== null);
}
