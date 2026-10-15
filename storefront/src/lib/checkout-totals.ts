import type { MoneyDto } from '@tiendafy/types';

/*
 * Las cuentas del resumen del checkout, en centavos. Son las mismas que hace
 * el servidor al crear la orden: lo que se muestra acá tiene que ser
 * exactamente lo que se cobra.
 */

/** Un medio de envío propio de la tienda, con su "gratis desde $X" si tiene. */
interface PricedMethod {
  price: MoneyDto;
  /** "Gratis desde $X": con ese subtotal de productos, el envío no se cobra. */
  freeAbove?: MoneyDto | null;
}

/**
 * "Gratis desde $X" de un medio propio: lo aplica el servidor con el subtotal
 * de productos (antes de cupones), y acá se muestra lo mismo.
 */
export const freeByAmount = (o: PricedMethod, subtotal: number): boolean =>
  Boolean(o.freeAbove && subtotal >= o.freeAbove.amount);

/** Lo que cuesta el envío de un medio propio con este subtotal. */
export const methodPrice = (o: PricedMethod, subtotal: number): number =>
  freeByAmount(o, subtotal) ? 0 : o.price.amount;

/**
 * El descuento por pagar a mano sobre un monto, en centavos: se redondea el
 * descuento y no el precio final, igual que el servidor (`Order.PercentOf`,
 * medio centavo hacia arriba).
 */
export const offlineDiscountOf = (amount: number, percent: number): number =>
  Math.round((amount * percent) / 100);

/**
 * El precio pagando con transferencia o efectivo: `a - round(a·%)`. Es la
 * cuenta que hace el checkout y la que cobra el servidor; la ficha y las
 * tarjetas lo anuncian con esto mismo. `round(a·(1-%))` en un medio centavo
 * exacto da un centavo más que lo que se cobra (12345 al 10%: 11111 contra 11110).
 */
export const priceWithOfflineDiscount = (amount: number, percent: number): number =>
  amount - offlineDiscountOf(amount, percent);

export interface CheckoutTotalsInput {
  /** Productos a precio de lista. */
  subtotal: number;
  /** El cupón aplicado (ya validado por el servidor), si hay. */
  coupon: { discount: number; freeShipping?: boolean } | null;
  /** El envío elegido, ya con el "gratis desde" del medio (ver methodPrice). */
  shipping: number;
  /** Paga a mano (transferencia o efectivo al retirar). */
  offline: boolean;
  /** El % de descuento de la tienda por pagar a mano. */
  offlinePercent: number | undefined;
}

export interface CheckoutTotals {
  /** El descuento del cupón, tal cual vino. */
  discount: number;
  /** El % por pagar a mano que se aplica (0 si paga con tarjeta). */
  offlinePct: number;
  offlineDiscount: number;
  /** El envío que se cobra (0 con un cupón de envío gratis). */
  shipCost: number;
  total: number;
}

/**
 * El mismo orden que el servidor (Order.UseOfflinePayment): cupón sobre el
 * subtotal, el % de la transferencia sobre lo que queda, y el envío entero.
 *
 * El descuento se redondea y después se resta (`a - round(a·%)`), como el
 * servidor y como lo anuncian la ficha y las tarjetas (priceWithOfflineDiscount).
 */
export function checkoutTotals({
  subtotal,
  coupon,
  shipping,
  offline,
  offlinePercent,
}: CheckoutTotalsInput): CheckoutTotals {
  const discount = coupon?.discount ?? 0;
  // Cupón de envío gratis: el servidor pone el envío en cero al crear la orden,
  // así que lo que se muestra acá tiene que decir lo mismo.
  const shipCost = coupon?.freeShipping ? 0 : shipping;
  const afterCoupon = Math.max(0, subtotal - discount);
  const offlinePct = offline ? (offlinePercent ?? 0) : 0;
  const offlineDiscount = offlineDiscountOf(afterCoupon, offlinePct);
  const total = afterCoupon - offlineDiscount + shipCost;
  return { discount, offlinePct, offlineDiscount, shipCost, total };
}
