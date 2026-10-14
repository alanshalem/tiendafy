import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * Aviso de que el borrador cambió en otro lado (otra pestaña, otra persona,
 * una publicación programada). Antes el último en guardar pisaba al otro sin
 * que nadie se enterara; ahora el autoguardado se frena y el comercio elige.
 * No bloquea: se puede seguir mirando y editando mientras decide.
 */
export function ConflictBanner({
  onReload,
  onKeepMine,
}: {
  onReload: () => Promise<void>;
  onKeepMine: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<'reload' | 'mine' | null>(null);
  const [failed, setFailed] = useState(false);
  const run = (which: 'reload' | 'mine', fn: () => Promise<void>) => {
    setBusy(which);
    setFailed(false);
    fn()
      .catch(() => setFailed(true))
      .finally(() => setBusy(null));
  };
  return (
    // En un celular el texto va arriba y los botones abajo, a lo ancho: en una
    // sola fila el texto quedaba de una palabra por renglón.
    <div
      role="alert"
      className="flex shrink-0 flex-col gap-2 border-b border-warning/30 bg-warning-bg px-4 py-2.5 text-sm text-fg sm:flex-row sm:items-center sm:gap-3"
    >
      <p className="flex min-w-0 flex-1 gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
        <span>
          El diseño cambió en otra pestaña o lo editó otra persona. Tus últimos cambios no se guardaron
          todavía.
          {failed && <span className="text-danger"> No se pudo completar: probá de nuevo.</span>}
        </span>
      </p>
      <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
        <button
          type="button"
          onClick={() => run('reload', onReload)}
          disabled={busy !== null}
          className="h-10 rounded-md border border-border bg-surface px-3 text-sm font-medium hover:bg-bg-muted disabled:opacity-50"
        >
          {busy === 'reload' ? 'Cargando…' : 'Recargar el último'}
        </button>
        <button
          type="button"
          onClick={() => run('mine', onKeepMine)}
          disabled={busy !== null}
          className="h-10 rounded-md bg-primary px-3 text-sm font-semibold text-primary-fg hover:opacity-90 disabled:opacity-50"
        >
          {busy === 'mine' ? 'Guardando…' : 'Guardar el mío igual'}
        </button>
      </div>
    </div>
  );
}
