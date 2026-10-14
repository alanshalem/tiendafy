/**
 * El número corto de una venta: "#A1B2C3D4", el principio de su id.
 *
 * Es el mismo que le llega al comprador por WhatsApp, el que se imprime en la
 * etiqueta de Correo y el que trae la planilla de ventas. Antes el panel no lo
 * mostraba en el listado (solo el escáner, en minúsculas): el buscador decía
 * aceptar "número de orden" pero no había de dónde sacarlo.
 */
export function orderNumber(id: string): string {
  return `#${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}
