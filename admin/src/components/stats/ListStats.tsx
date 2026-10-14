import { cn } from '@tiendafy/ui';
import { InfoDot } from '../charts';

export interface ListStat {
  label: string;
  value: string;
  /** Explicación del número (tooltip del ⓘ). */
  hint?: string;
  /** Resalta el número cuando pide acción (sin stock, sin facturar…). */
  tone?: 'default' | 'warning' | 'danger' | 'success';
  /**
   * Convierte la métrica en un filtro: al tocarla, el listado de abajo muestra
   * exactamente esas filas. Un número que se puede mirar pero no abrir obliga a
   * ir a buscar a mano lo que ya se contó.
   */
  onClick?: () => void;
  /** El filtro de esta métrica está puesto. */
  active?: boolean;
}

const TONE: Record<NonNullable<ListStat['tone']>, string> = {
  default: 'text-fg',
  warning: 'text-warning',
  danger: 'text-danger',
  success: 'text-success',
};

/**
 * Fila de métricas para encabezar un listado (la grilla de KPIs del panel).
 * Más chica que las KpiCard de Estadísticas a propósito: acá el protagonista
 * es la tabla, y estos números son el contexto que faltaba — cuántas cosas
 * hay, cuánto suman y qué pide atención antes de ponerse a mirar fila por fila.
 *
 * En el teléfono va de a dos por fila (2×2 con cuatro métricas). Antes eran
 * cuatro tarjetas a lo ancho, una debajo de otra, y empujaban el listado
 * entero fuera de la pantalla: había que bajar para ver la primera venta.
 * Con un número impar, la última ocupa la fila entera.
 */
export function ListStats({ items, className }: { items: ListStat[]; className?: string }) {
  if (items.length === 0) return null;

  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border',
        '[&>*:last-child:nth-child(odd)]:col-span-2',
        items.length >= 4
          ? 'lg:grid-cols-4 lg:[&>*:last-child:nth-child(odd)]:col-span-1'
          : items.length === 3
            ? 'sm:grid-cols-3 sm:[&>*:last-child:nth-child(odd)]:col-span-1'
            : '',
        className,
      )}
    >
      {items.map((s) => {
        const body = (
          <>
            <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-fg-muted">
              {s.label}
              {s.hint && <InfoDot info={s.hint} />}
            </div>
            <div
              className={cn(
                'mt-1 break-words text-lg font-bold tabular-nums sm:text-xl',
                TONE[s.tone ?? 'default'],
              )}
            >
              {s.value}
            </div>
          </>
        );

        if (!s.onClick) {
          return (
            <div key={s.label} className="min-w-0 bg-surface px-3 py-2.5 sm:px-4 sm:py-3">
              {body}
            </div>
          );
        }

        return (
          <button
            key={s.label}
            type="button"
            onClick={s.onClick}
            aria-pressed={s.active}
            title={s.active ? 'Quitar el filtro' : `Ver solo: ${s.label}`}
            className={cn(
              'group min-w-0 bg-surface px-3 py-2.5 text-left transition-colors hover:bg-bg-muted sm:px-4 sm:py-3',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40',
              s.active && 'bg-primary/10 hover:bg-primary/15',
            )}
          >
            {body}
            <span
              className={cn(
                'mt-1 text-3xs font-medium text-primary transition-opacity',
                // En el teléfono no hay hover: la pista ocupaba una línea vacía.
                s.active ? 'block opacity-100' : 'hidden opacity-0 group-hover:opacity-100 sm:block',
              )}
            >
              {s.active ? 'Filtrando · tocá para quitar' : 'Ver solo estos'}
            </span>
          </button>
        );
      })}
    </div>
  );
}
