import { useCallback, useEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';
import { useConfirm } from '@tiendafy/ui';

/**
 * Un formulario con cambios sin guardar no se pierde por un click de más:
 * irse a otra pantalla del panel pregunta "¿Descartar los cambios?" y cerrar
 * o recargar la pestaña pide la confirmación del navegador.
 *
 * Solo frena los cambios de pantalla (otro pathname): los filtros y pestañas
 * que viven en la query de la misma pantalla no se pierden al cambiar.
 *
 * Devuelve `leave(fn)`: para salir a propósito después de guardar (en ese
 * momento el form todavía cuenta como modificado) sin que pregunte.
 *
 * Una pantalla, un llamado: el router atiende un solo bloqueo a la vez. Los
 * forms en modal usan la prop `dirty` del Modal y useBeforeUnload.
 */
export function useUnsavedChanges(dirty: boolean): (go: () => void) => void {
  const confirm = useConfirm();
  const leaving = useRef(false);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    void confirm({
      title: '¿Descartar los cambios?',
      message: 'Hay cambios sin guardar en esta pantalla. Si salís, se pierden.',
      confirmLabel: 'Salir sin guardar',
      cancelLabel: 'Seguir editando',
      variant: 'danger',
    }).then((discard) => (discard ? blocker.proceed() : blocker.reset()));
  }, [blocker, confirm]);

  useBeforeUnload(dirty);

  return useCallback((go: () => void) => {
    leaving.current = true;
    go();
  }, []);
}

/**
 * El botón "Cancelar"/"Cerrar" propio de un form en modal: con cambios, la
 * misma pregunta que hace el Modal con la X, Escape o un click afuera (ver
 * la prop `dirty` del Modal).
 */
export function useGuardedClose(dirty: boolean, onClose: () => void): () => void {
  const confirm = useConfirm();
  return () => {
    if (!dirty) return onClose();
    void confirm({
      title: '¿Descartar los cambios?',
      message: 'Lo que cargaste y no guardaste se va a perder.',
      confirmLabel: 'Descartar',
      cancelLabel: 'Seguir editando',
      variant: 'danger',
    }).then((discard) => {
      if (discard) onClose();
    });
  };
}

/** Cerrar o recargar la pestaña con cambios sin guardar pide la confirmación del navegador. */
export function useBeforeUnload(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Los navegadores viejos piden returnValue para mostrar el aviso.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);
}
