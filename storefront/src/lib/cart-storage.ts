import { readJson, removeKey, writeJson } from './storage';

/**
 * Dónde guarda la tienda lo que el comprador va armando: carrito, cupón y sus
 * datos de entrega. Las claves viven acá (y no en cada componente) porque hay
 * un momento en que se tocan todas juntas: cuando la compra sale bien.
 */
export const cartStorageKey = (storeKey: string) => `tiendafy.cart.${storeKey}`;

/**
 * El cupón aplicado vive al lado del carrito (misma tienda, misma duración):
 * antes moría en el estado del drawer y el comprador tenía que volver a
 * escribirlo en el checkout — o se olvidaba y pagaba de más.
 */
export const couponStorageKey = (storeKey: string) => `tiendafy.coupon.${storeKey}`;

/**
 * Los datos de contacto y entrega del checkout (nunca los de la tarjeta). Así
 * una recarga, o volver de un rechazo de Mercado Pago, no obliga a escribir
 * todo de nuevo. Van en sessionStorage y no en localStorage: sobreviven al
 * viaje a Mercado Pago (misma pestaña) pero no quedan en una computadora
 * compartida cuando la persona cierra la pestaña.
 */
export const buyerStorageKey = (storeKey: string) => `tiendafy.buyer.${storeKey}`;

export function readBuyer<T>(storeKey: string): Partial<T> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(buyerStorageKey(storeKey));
    return raw ? (JSON.parse(raw) as Partial<T>) : null;
  } catch {
    return null;
  }
}

export function writeBuyer(storeKey: string, data: object): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(buyerStorageKey(storeKey), JSON.stringify(data));
  } catch {
    /* sin almacenamiento: se pierde al recargar, como antes */
  }
}

function clearBuyer(storeKey: string): void {
  try {
    window.sessionStorage.removeItem(buyerStorageKey(storeKey));
  } catch {
    /* modo privado */
  }
}

/** Órdenes cuya compra ya se cerró en este navegador (ver finishPurchase). */
const doneKey = (storeKey: string) => `tiendafy.done.${storeKey}`;

/**
 * Aviso a los carritos montados de que el guardado cambió por afuera (el
 * checkout repreció, una compra lo vació). Es un evento propio porque el
 * `storage` del navegador solo llega a las OTRAS pestañas.
 */
export const CART_SYNC_EVENT = 'tiendafy:cart-sync';

function notifyCartChanged(storeKey: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CART_SYNC_EVENT, { detail: { key: cartStorageKey(storeKey) } }));
}

/**
 * Cierra una compra confirmada: vacía el carrito, el cupón y los datos del
 * comprador, UNA vez por orden. Sin el registro de órdenes cerradas, volver
 * con "atrás" a la pantalla de "listo" días después borraba el carrito nuevo
 * que la persona estaba armando. Devuelve si limpió algo.
 */
export function finishPurchase(storeKey: string, orderId: string): boolean {
  const done = readJson<string[]>(doneKey(storeKey), []);
  if (done.includes(orderId)) return false;
  // Las últimas veinte alcanzan: nadie vuelve a una pantalla de "listo" tan vieja.
  writeJson(doneKey(storeKey), [...done, orderId].slice(-20));
  removeKey(cartStorageKey(storeKey));
  removeKey(couponStorageKey(storeKey));
  if (typeof window !== 'undefined') clearBuyer(storeKey);
  notifyCartChanged(storeKey);
  return true;
}
