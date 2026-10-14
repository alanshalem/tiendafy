/**
 * El id corto de una venta: "#A1B2C3D4", el principio de su id. Es lo que se
 * mostraba antes de que las ventas tuvieran número, y lo que llevan las
 * etiquetas y los WhatsApp viejos (el buscador lo sigue encontrando).
 */
export function orderNumber(id: string): string {
  return `#${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

/**
 * Cómo se nombra una venta ante una persona: "#1042", el número de la tienda
 * (correlativo, el que ve el comprador en sus mails y en "Seguí tu pedido").
 * Si la respuesta no trae número (una venta sin guardar, una API vieja), cae
 * al id corto.
 */
export function orderLabel(order: { id: string; number?: number | null }): string {
  return order.number && order.number > 0 ? `#${order.number}` : orderNumber(order.id);
}
