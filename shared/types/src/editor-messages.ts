/**
 * Protocolo de mensajes entre el editor de diseño (admin) y el iframe de preview
 * (storefront), vía postMessage. Centralizado para evitar typos: un string mal
 * escrito rompía la comunicación en silencio.
 */
export const EDITOR_MSG = {
  /** admin → iframe: aplicar el theme del draft en vivo. */
  theme: 'tiendafy:theme',
  /** iframe → admin: el usuario clickeó una región editable (abrir su panel). */
  editSection: 'tiendafy:edit-section',
  /** iframe → admin: eliminar una sección. */
  deleteSection: 'tiendafy:delete-section',
  /** admin → iframe: resaltar/scrollear a una sección al abrir su panel. */
  focusSection: 'tiendafy:focus-section',
  /** admin → iframe: abrir/cerrar el drawer del carrito. */
  previewCart: 'tiendafy:preview-cart',
  /** iframe → admin: el preview terminó de montar y escucha mensajes. */
  previewReady: 'tiendafy:preview-ready',
} as const;

export type EditorMsgType = (typeof EDITOR_MSG)[keyof typeof EDITOR_MSG];
