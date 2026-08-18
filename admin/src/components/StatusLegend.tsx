import { Fragment } from 'react';
import { cn } from '@tiendafy/ui';

export interface LegendItem {
  /** Clase de fondo del puntito de color (ej. 'bg-success', 'bg-amber-400'). */
  dot: string;
  text: string;
}

/**
 * Leyenda pedagógica de una línea arriba de una tabla: qué significa cada
 * color de estado. Con `flow`, los ítems se unen con → (para ciclos con orden,
 * como el de una orden de compra).
 */
export function StatusLegend({
  items,
  flow = false,
  className,
}: {
  items: LegendItem[];
  flow?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1', className)}>
      {items.map((l, i) => (
        <Fragment key={l.text}>
          {flow && i > 0 && <span className="text-xs text-fg-subtle/60">→</span>}
          <span className="inline-flex items-center gap-1.5 text-xs text-fg-subtle">
            <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', l.dot)} />
            {l.text}
          </span>
        </Fragment>
      ))}
    </div>
  );
}
