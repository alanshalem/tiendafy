/** Id del panel izquierdo del editor (el <aside> de ThemeEditor). */
export const EDITOR_PANEL_ID = 'theme-editor-panel';

/**
 * Lleva el foco al principio del panel (su botón de volver, que dice el nombre
 * de la sección) después de que React lo dibuje. Se usa al abrir una sección
 * recién agregada: el botón que se tocó ya no existe y el foco quedaba en el
 * <body>, con el teclado arrancando de nuevo desde arriba de todo.
 */
export function focusEditorPanel() {
  requestAnimationFrame(() => {
    const panel = document.getElementById(EDITOR_PANEL_ID);
    panel?.scrollTo({ top: 0 });
    panel?.querySelector<HTMLElement>('button, input, [tabindex="0"]')?.focus();
  });
}
