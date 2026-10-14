import { type MoneyDto } from '@tiendafy/types';
import type { StoreProduct } from '@/components/store/ProductCard';

/**
 * Tipos del catálogo y mappers PUROS (DTO → modelo de la tienda). Viven aparte
 * de catalog.ts porque ese módulo importa lib/api (server-only): sin esta
 * separación, el cliente arrastraba el fetcher del servidor solo para mapear.
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
    ...(p.description?.trim() ? { excerpt: excerptOf(p.description) } : {}),
  };
}

/** Largo del resumen de la descripción: lo que muestra el "Producto destacado". */
export const EXCERPT_MAX = 200;

/**
 * La descripción en una línea y cortada en una palabra: el resumen del
 * "Producto destacado". Va acá (y no la descripción entera) para no mandarle
 * al navegador páginas de texto por cada card de la portada.
 */
export function excerptOf(description: string, max = EXCERPT_MAX): string {
  const flat = description.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, '')}…`;
}

/** DTOs (posiblemente null) → StoreProduct, descartando inválidos. */
export function toStoreProducts(dtos: (ProductDto | null)[]): StoreProduct[] {
  return dtos.map((d) => (d ? toStoreProduct(d) : null)).filter((p): p is StoreProduct => p !== null);
}
