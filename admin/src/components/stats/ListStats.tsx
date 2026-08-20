import { cn } from '@tiendafy/ui';
import { InfoDot } from '../charts';

export interface ListStat {
  label: string;
  value: string;
  /** Explicación del número (tooltip del ⓘ). */
  hint?: string;
  /** Resalta el número cuando pide acción (sin stock, sin facturar…). */
  tone?: 'default' | 'warning' | 'danger' | 'success';
}

const TONE: Record<NonNullable<ListStat['tone']>, string> = {
  default: 'text-fg',
  warning: 'text-warning',
  danger: 'text-danger',
  success: 'text-success',
};

/**
 * Fila de métricas para encabezar un listado. Más chica que las KpiCard de
 * Estadísticas a propósito: acá el protagonista es la tabla, y estos números
 * son el contexto que faltaba — cuántas cosas hay, cuánto suman y qué pide
 * atención antes de ponerse a mirar fila por fila.
 */
export function ListStats({ items, className }: { items: ListStat[]; className?: string }) {
  if (items.length === 0) return null;

  return (
    <div
      className={cn(
        'grid gap-px overflow-hidden rounded-lg border border-border bg-border',
        items.length >= 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3',
        className,
      )}
    >
      {items.map((s) => (
        <div key={s.label} className="bg-surface px-4 py-3">
          <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-fg-muted">
            {s.label}
            {s.hint && <InfoDot info={s.hint} />}
          </div>
          <div className={cn('mt-1 text-xl font-bold tabular-nums', TONE[s.tone ?? 'default'])}>
            {s.value}
          </div>
        </div>
      ))}
    </div>
  );
}
