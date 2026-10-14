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
  /**
   * Las reseñas del producto, si tiene (las suma la ficha cuando existan).
   * Sin reseñas no va el bloque: Google rechaza un aggregateRating en cero.
   */
  rating?: { value: number; count: number } | null;
}

/** Lo que el schema necesita de la tienda (no del producto). */
export interface StoreForJsonLd {
  /**
   * Desde cuánto el envío es gratis (centavos; 0 o nada = no hay envío gratis
   * por monto). Es el único costo de envío que se sabe sin el código postal:
   * los carriers cotizan por destino.
   */
  freeShippingThreshold?: number;
}

/** Días para arrepentirse de una compra online (Ley 24.240 de Defensa del Consumidor, art. 34). */
export const RETURN_DAYS = 10;

/**
 * La política de devolución: el botón de arrepentimiento obliga a aceptar la
 * devolución dentro de los 10 días, sin costo para el comprador. Es la misma
 * para toda tienda argentina.
 */
const returnPolicy = {
  '@type': 'MerchantReturnPolicy',
  applicableCountry: 'AR',
  returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
  merchantReturnDays: RETURN_DAYS,
  returnMethod: 'https://schema.org/ReturnByMail',
  returnFees: 'https://schema.org/FreeReturn',
};

/**
 * El envío: a todo el país, y gratis si el precio supera el monto de envío
 * gratis de la tienda. Sin ese dato no se inventa un costo (cada carrier
 * cotiza distinto por destino): va el destino solo, que Google acepta.
 */
function shippingDetails(currency: string, lowestPrice: number, store: StoreForJsonLd) {
  const threshold = store.freeShippingThreshold ?? 0;
  const free = threshold > 0 && lowestPrice >= threshold;
  return {
    '@type': 'OfferShippingDetails',
    shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'AR' },
    ...(free ? { shippingRate: { '@type': 'MonetaryAmount', value: '0.00', currency } } : {}),
  };
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
export function productJsonLd(
  product: ProductForJsonLd,
  base: string,
  store: StoreForJsonLd = {},
): Record<string, unknown> | null {
  const variants = product.variants;
  if (variants.length === 0) return null;

  const url = base ? `${base}/productos/${product.slug}` : undefined;
  // Disponibilidad REAL (datos falsos = perder rich results).
  // stock null = desconocido → optimista InStock.
  const availability = product.stock === 0 ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock';
  const currency = variants[0]!.price.currency;
  const amounts = variants.map((v) => v.price.amount);
  const skus = [...new Set(variants.map((v) => v.sku?.trim()).filter(Boolean))];
  // Lo mismo para cualquier oferta: envío y devolución.
  const terms = {
    shippingDetails: shippingDetails(currency, Math.min(...amounts), store),
    hasMerchantReturnPolicy: returnPolicy,
  };

  const offers =
    variants.length === 1
      ? {
          '@type': 'Offer',
          priceCurrency: currency,
          price: price(amounts[0]!),
          availability,
          ...(url ? { url } : {}),
          ...terms,
        }
      : {
          '@type': 'AggregateOffer',
          priceCurrency: currency,
          lowPrice: price(Math.min(...amounts)),
          highPrice: price(Math.max(...amounts)),
          offerCount: variants.length,
          availability,
          ...(url ? { url } : {}),
          ...terms,
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
    ...(product.rating && product.rating.count > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: Number(product.rating.value.toFixed(1)),
            reviewCount: product.rating.count,
          },
        }
      : {}),
    offers,
  };
}
