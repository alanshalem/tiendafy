import { readJson, writeJson } from './storage';

/**
 * El código postal que el comprador usó para calcular el envío, por tienda.
 *
 * Se escribe una vez (en la ficha o en el checkout) y se reusa en el resto:
 * pedirle el mismo dato en cada producto y otra vez al pagar es la fricción
 * que hace que se vaya a mirar el envío a otro lado.
 */
export const postalCodeStorageKey = (storeKey: string) => `tiendafy.cp.${storeKey}`;

/** Un código postal argentino de 4 dígitos (el CPA de 8 caracteres se recorta a sus 4 números). */
export function normalizePostalCode(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.slice(0, 4);
}

export const isPostalCode = (cp: string) => /^\d{4}$/.test(cp);

export function readPostalCode(storeKey: string): string {
  const saved = readJson<string>(postalCodeStorageKey(storeKey), '');
  return typeof saved === 'string' && isPostalCode(saved) ? saved : '';
}

export function savePostalCode(storeKey: string, cp: string): void {
  if (isPostalCode(cp)) writeJson(postalCodeStorageKey(storeKey), cp);
}
