/**
 * Semántica de precios:
 * - "Precio" = precio de lista (regular). Se tacha cuando hay oferta.
 * - "Precio promocional" = oferta (menor). Es el que se cobra y se muestra.
 *
 * En el dominio guardamos `price` = monto cobrado (se muestra) y
 * `compareAtPrice` = el "antes" (tachado, opcional). Estos helpers traducen
 * entre los campos del form y el dominio, normalizando: SIEMPRE se cobra el
 * menor y se tacha el mayor (robusto a datos invertidos del scraping).
 *
 * Montos en centavos.
 */

export interface FormPrice {
  /** Precio de lista (campo "Precio"). */
  regular: number;
  /** Precio promocional (campo "Promocional"), null si no hay. */
  promo: number | null;
}

export interface DomainPrice {
  /** Monto cobrado / mostrado. */
  priceAmount: number;
  /** Monto tachado, null si no hay oferta. */
  compareAtAmount: number | null;
}

/** Dominio → campos del form. */
export function toFormPrice(priceAmount: number, compareAtAmount: number | null): FormPrice {
  return compareAtAmount != null
    ? { regular: compareAtAmount, promo: priceAmount }
    : { regular: priceAmount, promo: null };
}

/** Campos del form → dominio. Cobra el menor, tacha el mayor. */
export function toDomainPrice(regular: number, promo: number | null): DomainPrice {
  if (promo == null || promo === regular) return { priceAmount: regular, compareAtAmount: null };
  return { priceAmount: Math.min(regular, promo), compareAtAmount: Math.max(regular, promo) };
}
