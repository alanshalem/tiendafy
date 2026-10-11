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

interface FormPrice {
  /** Precio de lista (campo "Precio"). */
  regular: number;
  /** Precio promocional (campo "Promocional"), null si no hay. */
  promo: number | null;
}

interface DomainPrice {
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

/* ---- Texto que escribe una persona ↔ centavos ---------------------------------------------- */

/** Miles al estilo argentino: hasta tres dígitos (sin cero adelante), punto, y tres más. */
const AR_THOUSANDS = /^[1-9]\d{0,2}\.\d{3}$/;

/**
 * Centavos a partir de un importe escrito a mano. NaN si no es un número.
 *
 * Es el único lector de importes del panel. Antes había seis, y no coincidían:
 * el de Tesorería leía `1500.50` como $150.050 —y el autocompletado del precio
 * sugerido en Presupuestos generaba justamente ese formato—, mientras el de
 * cupones leía `1.500` como $1,50. Cada uno acertaba donde el otro fallaba.
 *
 * Las reglas resuelven lo que el texto permite resolver, y nada más:
 * - Con punto y coma, el que aparece último es el decimal y el otro es miles:
 *   `1.234,56` y `1,234.56` son el mismo número.
 * - Solo comas: una sola es decimal (`1500,5`); varias son miles (`1,234,567`).
 * - Solo puntos: varios son miles (`1.234.567`). Uno solo es miles únicamente
 *   con la forma exacta de un grupo argentino —`1.500`, `12.345`—; cualquier
 *   otra cosa es decimal (`1500.50`, `1.5`, `0.500`).
 *
 * Para `<input type="number">` no hace falta: el navegador entrega siempre
 * punto decimal y nunca miles, y ahí alcanza con `Number(value)`.
 */
export function parseMoneyInput(text: string): number {
  const cleaned = text.trim().replace(/[\s$]/g, '');
  // El signo pasa tal cual, como en los lectores anteriores: si un negativo
  // vale o no lo decide cada pantalla con su propia validación.
  const negative = cleaned.startsWith('-');
  const raw = negative ? cleaned.slice(1) : cleaned;
  if (raw === '') return NaN;

  const dot = raw.lastIndexOf('.');
  const comma = raw.lastIndexOf(',');
  let plain: string;

  if (dot >= 0 && comma >= 0) {
    const decimalSep = dot > comma ? '.' : ',';
    const thousandsSep = decimalSep === '.' ? ',' : '.';
    plain = raw.split(thousandsSep).join('').replace(decimalSep, '.');
  } else if (comma >= 0) {
    plain = raw.indexOf(',') === comma ? raw.replace(',', '.') : raw.split(',').join('');
  } else if (dot >= 0) {
    const several = raw.indexOf('.') !== dot;
    plain = several || AR_THOUSANDS.test(raw) ? raw.split('.').join('') : raw;
  } else {
    plain = raw;
  }

  // Separador colgado (`1500.`, `1500,` a mitad de tipeo) o decimal sin entero
  // (`.5`): los lectores anteriores los aceptaban, y este también.
  if (!/^(\d+\.?\d*|\.\d+)$/.test(plain)) return NaN;
  const minor = Math.round(Number(plain) * 100);
  return negative ? -minor : minor;
}

/**
 * Centavos a partir del texto de un campo de precio. Mismo lector que
 * `parseMoneyInput`: los forms de producto validan antes con `isValidPrice`,
 * así que acá solo llega `1500`, `1500,5` o `1500.50`, y eso no cambió.
 */
export const toCents = (s: string): number => parseMoneyInput(s);

/** Centavos → texto en pesos (para poblar los inputs). */
export const toPesos = (cents: number): string => (cents / 100).toString();

/** ¿El texto es un precio válido? (entero o con 1-2 decimales). */
export const isValidPrice = (s: string): boolean => /^\d+([.,]\d{1,2})?$/.test(s.replace(',', '.'));
