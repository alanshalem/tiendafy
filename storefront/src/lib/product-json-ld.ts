import type { MoneyDto } from '@tiendafy/types';

/** Lo que el schema de producto necesita de la ficha. */
export interface ProductForJsonLd {
  name: string;
  slug: string;
  description: string | null;
  brand?: string | null;
  images: { url: string }[];
  variants: { sku: string; price: MoneyDto }[];
  stock: number | null;
}

/** Centavos → "1299.00", como lo pide schema.org. */
const price = (amount: number) => (amount / 100).toFixed(2);

/**
 * Schema.org Product para los resultados enriquecidos de Google: precio,
 * moneda, disponibilidad, marca y SKU.
 *
 * Con una sola variante va un Offer con su precio. Con varias, un
 * AggregateOffer con el rango (de… a…) y cuántas hay: antes se publicaba el
 * precio de la primera variante como si fuera el único, y si no era el más
 * barato Google mostraba un precio que no coincidía con la página.
 *
 * Null si el producto no tiene variantes (no tiene precio que mostrar).
 */
export function productJsonLd(product: ProductForJsonLd, base: string): Record<string, unknown> | null {
  const variants = product.variants;
  if (variants.length === 0) return null;

  const url = base ? `${base}/productos/${product.slug}` : undefined;
  // Disponibilidad REAL (datos falsos = perder rich results).
  // stock null = desconocido → optimista InStock.
  const availability = product.stock === 0 ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock';
  const currency = variants[0]!.price.currency;
  const amounts = variants.map((v) => v.price.amount);
  const skus = [...new Set(variants.map((v) => v.sku?.trim()).filter(Boolean))];

  const offers =
    variants.length === 1
      ? {
          '@type': 'Offer',
          priceCurrency: currency,
          price: price(amounts[0]!),
          availability,
          ...(url ? { url } : {}),
        }
      : {
          '@type': 'AggregateOffer',
          priceCurrency: currency,
          lowPrice: price(Math.min(...amounts)),
          highPrice: price(Math.max(...amounts)),
          offerCount: variants.length,
          availability,
          ...(url ? { url } : {}),
        };

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    ...(product.description ? { description: product.description.slice(0, 500) } : {}),
    ...(product.images.length ? { image: product.images.map((i) => i.url) } : {}),
    ...(url ? { url } : {}),
    ...(product.brand?.trim() ? { brand: { '@type': 'Brand', name: product.brand.trim() } } : {}),
    // Un SKU por producto: el de la única variante (con varias, cada una tiene el suyo).
    ...(skus.length === 1 && variants.length === 1 ? { sku: skus[0] } : {}),
    offers,
  };
}
