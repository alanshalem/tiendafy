/**
 * Navegación con carga completa de página (no la del router de Next).
 *
 * Se usa a propósito para entrar y salir del checkout: la página de pago no
 * carga medición de terceros, y una navegación del router dejaba en memoria
 * los scripts que ya había cargado la página anterior. También es la que
 * permite que la pantalla de "listo" arranque de cero y mida la venta.
 *
 * Vive en su propio módulo para poder reemplazarla en los tests (jsdom no
 * navega).
 */
export function hardNavigate(url: string): void {
  window.location.assign(url);
}
