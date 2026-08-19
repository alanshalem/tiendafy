/**
 * Reemplaza un elemento de una lista devolviendo una copia. Es el patrón de
 * todos los editores de líneas del panel (items de una venta manual, kits,
 * compras): `list.map((x, i) => (i === idx ? { ...x, campo: v } : x))` escrito
 * a mano en cada onChange, donde es fácil comparar contra el índice equivocado.
 */
export const replaceAt = <T>(list: T[], index: number, patch: Partial<T>): T[] =>
  list.map((x, i) => (i === index ? { ...x, ...patch } : x));
