import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

export interface UndoNotice {
  /** Distinto en cada aviso: reinicia la cuenta regresiva. */
  key: number;
  message: string;
  onUndo: () => void;
}

/** Cuánto queda a la vista el "Deshacer". */
export const UNDO_NOTICE_MS = 8000;

/**
 * "Eliminaste «Carrusel». Deshacer": borrar una sección es inmediato y se
 * puede volver atrás desde acá (o con Ctrl+Z). Preguntar "¿Seguro?" cada vez
 * cansa y se aprieta "Sí" sin leer; deshacer sirve también cuando uno se dio
 * cuenta tarde.
 *
 * No usa el aviso general (useToast): ese no tiene botones y en el celular
 * tapaba las pestañas de abajo. Este va encima de ellas. Mientras el mouse o
 * el foco están encima no se va (hay que poder llegar al botón con calma).
 */
export function UndoSnackbar({ notice, onDismiss }: { notice: UndoNotice | null; onDismiss: () => void }) {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!notice || paused) return;
    const t = window.setTimeout(onDismiss, UNDO_NOTICE_MS);
    return () => window.clearTimeout(t);
  }, [notice, paused, onDismiss]);

  if (!notice) return null;
  return (
    <div
      role="status"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="fixed inset-x-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-[75] flex items-center gap-2 rounded-lg bg-fg py-1.5 pl-4 pr-1.5 text-sm text-bg shadow-overlay md:inset-x-auto md:bottom-4 md:left-[21rem] md:max-w-sm"
    >
      <span className="min-w-0 flex-1 truncate">{notice.message}</span>
      <button
        type="button"
        onClick={() => {
          notice.onUndo();
          onDismiss();
        }}
        className="h-10 shrink-0 rounded-md px-3 font-semibold underline underline-offset-2 hover:bg-bg/10"
      >
        Deshacer
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Cerrar aviso"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md opacity-70 hover:opacity-100"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
