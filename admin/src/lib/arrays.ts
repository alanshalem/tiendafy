/**
 * Reemplaza un elemento de una lista devolviendo una copia. Es el patrón de
 * todos los editores de líneas del panel (items de una venta manual, kits,
 * compras): `list.map((x, i) => (i === idx ? { ...x, campo: v } : x))` escrito
 * a mano en cada onChange, donde es fácil comparar contra el índice equivocado.
 */
export const replaceAt = <T>(list: T[], index: number, patch: Partial<T>): T[] =>
  list.map((x, i) => (i === index ? { ...x, ...patch } : x));

/**
 * Mueve un elemento de la posición `from` a la `to` y devuelve una copia. Es
 * lo que hace cada lista que se reordena arrastrando —secciones de la home,
 * categorías, productos destacados—, que tenían el mismo par de `splice`
 * escrito a mano. Con un índice fuera de rango devuelve la lista intacta: el
 * splice suelto, con -1, sacaba el último elemento sin avisar.
 */
export const moveItem = <T>(list: T[], from: number, to: number): T[] => {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return list;
  const next = [...list];
  const [moved] = next.splice(from, 1) as [T];
  next.splice(to, 0, moved);
  return next;
};
