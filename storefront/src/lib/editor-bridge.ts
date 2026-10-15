import { adminOrigin } from './admin';

/*
 * El canal con el editor de tienda (el panel admin, que embebe la vista previa
 * en un iframe). Su origin es el único par legítimo del postMessage: se usa
 * como targetOrigin al emitir y para validar e.origin al recibir — nunca '*':
 * un sitio malicioso que embeba el preview no debe poder inyectar un theme ni
 * recibir mensajes.
 */

/** Un mensaje para el editor (la ventana que embebe la vista previa). */
export function postToEditor(message: object): void {
  window.parent?.postMessage(message, adminOrigin());
}

/** Si el mensaje lo mandó el editor y no un tercero. */
export function isFromEditor(e: MessageEvent): boolean {
  return e.origin === adminOrigin();
}
