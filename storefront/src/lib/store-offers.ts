import type { MoneyDto } from '@tiendafy/types';
import type { ThemeConfig } from '@tiendafy/types';

/**
 * Lo que la tienda promete sobre el pago y el envío, como lo responde
 * GET /api/v1/store-offers: el descuento por transferencia, las cuotas sin
 * interés y el envío gratis desde $X. Es la fuente única de esos números: la
 * ficha, las tarjetas, la barra del carrito y el checkout dicen lo mismo que
 * cobra el servidor.
 */
export interface StoreOffers {
  /** false = la tienda nunca guardó sus opciones de pago: valen las del diseño (temas viejos). */
  configured: boolean;
  transfer: { enabled: boolean; discountPercent: number; holdHours: number };
  cashOnPickup: { enabled: boolean };
  installments: { max: number; note: string | null };
  /** El umbral más bajo de los medios de envío activos (null = ninguno tiene). */
  freeShipping: { from: MoneyDto; methodName: string } | null;
  /** Hay al menos un medio de pago: sin ninguno, el carrito ofrece escribirle a la tienda. */
  canCheckout: boolean;
}

/** El tema con las ofertas de la tienda ya aplicadas (ver applyStoreOffers). */
type ThemeWithOffers = ThemeConfig & { storeOffers?: StoreOffers | null };

/** Las ofertas que vinieron con el tema, si vinieron. */
export function offersOf(theme: ThemeConfig): StoreOffers | null {
  return (theme as ThemeWithOffers).storeOffers ?? null;
}

/**
 * Pisa los números del diseño con los de la tienda, así cada componente que ya
 * los leía del tema (la ficha, las tarjetas, la barra del carrito) muestra lo
 * que el checkout va a cobrar sin tener que saber de dónde salen.
 *
 * - Descuento y cuotas: si la tienda nunca guardó sus opciones, siguen los del
 *   diseño (un tema viejo se ve igual que ayer); guardadas, mandan ellas —
 *   también para apagarlos: una transferencia desactivada no anuncia descuento.
 * - Envío gratis: sale SOLO de los medios de envío. El monto del diseño era una
 *   promesa que el checkout no cumplía; sin un medio con "gratis desde", la
 *   barra no se muestra.
 *
 * Sin respuesta de la API (null) el tema queda como estaba: mejor lo de ayer
 * que una tienda sin precios con transferencia por un error pasajero.
 */
export function applyStoreOffers(theme: ThemeConfig, offers: StoreOffers | null): ThemeWithOffers {
  // Una respuesta sin la forma esperada (una API vieja que no conoce la ruta y
  // contesta otra cosa) cuenta como "sin respuesta".
  if (!offers?.transfer || !offers.installments || !offers.cashOnPickup) return theme;
  const configured = offers.configured;
  const discount = offers.transfer.enabled ? offers.transfer.discountPercent : 0;
  const installments = offers.installments.max;
  return {
    ...theme,
    productDetail: {
      ...theme.productDetail,
      cashDiscountPercent: configured ? discount : theme.productDetail.cashDiscountPercent,
      installmentsCount: configured ? installments : theme.productDetail.installmentsCount,
    },
    productList: {
      ...theme.productList,
      installmentsCount: configured ? installments : theme.productList.installmentsCount,
    },
    cart: {
      ...theme.cart,
      freeShippingThreshold: offers.freeShipping?.from.amount ?? 0,
    },
    storeOffers: offers,
  };
}

/** Cómo se dice el descuento: "transferencia o efectivo" solo si el efectivo existe. */
export function offlineDiscountLabel(offers: StoreOffers | null): string {
  return offers?.cashOnPickup.enabled || !offers?.configured ? 'transferencia o efectivo' : 'transferencia';
}
