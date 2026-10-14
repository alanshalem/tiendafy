/**
 * Qué <dialog> modal está arriba de todo. Un modal abierto con showModal()
 * vuelve inerte todo lo que no está adentro suyo —incluido lo que se ve por
 * encima—, así que lo que tenga que poder tocarse con un modal abierto (los
 * avisos) tiene que vivir DENTRO del de arriba. Los modales se anotan acá al
 * abrir y se borran al cerrar; el orden es el de la capa superior del navegador.
 */
type Listener = () => void;

let stack: HTMLDialogElement[] = [];
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l();
}

export const topLayer = {
  push(dialog: HTMLDialogElement) {
    stack = [...stack.filter((d) => d !== dialog), dialog];
    emit();
  },
  remove(dialog: HTMLDialogElement) {
    if (!stack.includes(dialog)) return;
    stack = stack.filter((d) => d !== dialog);
    emit();
  },
  /** El modal de arriba, o null si no hay ninguno abierto. */
  top(): HTMLDialogElement | null {
    return stack[stack.length - 1] ?? null;
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
