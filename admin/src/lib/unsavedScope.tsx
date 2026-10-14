import { createContext, useCallback, useContext, useEffect, useId, useState, type ReactNode } from 'react';
import { useBeforeUnload, useUnsavedChanges } from './useUnsavedChanges';

type Report = (id: string, dirty: boolean) => void;

const ScopeContext = createContext<Report | null>(null);

/**
 * Un solo bloqueo de navegación para varias pantallas con forms adentro.
 *
 * El router atiende un bloqueo a la vez (ver useUnsavedChanges), y una pantalla
 * de Configuración puede tener varios forms sueltos —Medios de pago tiene las
 * claves de Payway y las opciones de transferencia en la misma página—. Cada
 * form avisa si tiene cambios con useUnsavedInScope y el scope, que vive en el
 * layout, frena la salida si alguno los tiene.
 */
export function UnsavedChangesScope({ children }: { children: ReactNode }) {
  const [dirtyIds, setDirtyIds] = useState<ReadonlySet<string>>(() => new Set());
  const report = useCallback<Report>((id, dirty) => {
    setDirtyIds((prev) => {
      if (prev.has(id) === dirty) return prev;
      const next = new Set(prev);
      if (dirty) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  useUnsavedChanges(dirtyIds.size > 0);
  return <ScopeContext.Provider value={report}>{children}</ScopeContext.Provider>;
}

/**
 * El form tiene cambios sin guardar: irse a otra pantalla pregunta y cerrar
 * la pestaña pide la confirmación del navegador. `dirty` tiene que comparar
 * contra lo guardado, así después de guardar deja de preguntar solo.
 *
 * Fuera de un UnsavedChangesScope queda al menos el aviso del navegador.
 */
export function useUnsavedInScope(dirty: boolean) {
  const report = useContext(ScopeContext);
  const id = useId();
  useEffect(() => {
    if (!report) return;
    report(id, dirty);
    return () => report(id, false);
  }, [report, id, dirty]);
  useBeforeUnload(dirty && !report);
}
