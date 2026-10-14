import type { ReactNode } from 'react';
import { clickableRowProps, cn, Table, type TableColumn } from '@tiendafy/ui';
import { useIsMobile } from '../lib/useMediaQuery';

/**
 * Listados que en el teléfono son tarjetas y en la compu, tabla.
 *
 * Una tabla de seis columnas en 390 px se corta: el precio "$ 117.187" quedaba
 * en "$ 11" y el nombre del producto en tres letras. En el teléfono cada fila
 * pasa a ser una tarjeta con lo que importa arriba (qué es y cuánto) y el
 * resto en una línea chica abajo; las acciones van al menú de la tarjeta.
 */

export interface ListCardProps {
  /** Qué es: el nombre, el número de la venta. */
  title: ReactNode;
  /** Debajo del título: un email, una variante, una fecha. */
  subtitle?: ReactNode;
  /** El número de la fila, a la derecha y en grande: un total, un precio. */
  value?: ReactNode;
  /** Estados (Badge) en la línea de abajo. */
  badges?: ReactNode;
  /** Datos chicos en la línea de abajo ("3 compras", "Stock 12"). */
  meta?: ReactNode;
  /** A la izquierda: una foto, una casilla de selección. */
  leading?: ReactNode;
  /** A la derecha de todo: el menú de acciones de la fila. */
  actions?: ReactNode;
  /** Tocar la tarjeta abre el detalle (también con Enter, como las filas de la tabla). */
  onOpen?: () => void;
  className?: string;
}

/** Una fila de listado como tarjeta. Va adentro de {@link ListCardList}. */
export function ListCard({
  title,
  subtitle,
  value,
  badges,
  meta,
  leading,
  actions,
  onOpen,
  className,
}: ListCardProps) {
  const open = onOpen ? clickableRowProps(onOpen) : null;
  return (
    <li
      {...(open ?? {})}
      className={cn(
        'flex items-start gap-3 px-4 py-3',
        onOpen && 'hover:bg-bg-muted/60 active:bg-bg-muted',
        open?.className,
        className,
      )}
    >
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate font-semibold text-fg">{title}</div>
            {subtitle && <div className="truncate text-sm text-fg-muted">{subtitle}</div>}
          </div>
          {value != null && value !== false && (
            <div className="shrink-0 text-right font-semibold tabular-nums text-fg">{value}</div>
          )}
        </div>
        {(badges || meta) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
            {badges}
            {meta}
          </div>
        )}
      </div>
      {actions && <div className="-mr-2 -mt-1 shrink-0">{actions}</div>}
    </li>
  );
}

/** El contenedor de las tarjetas: una lista con separadores, sin márgenes propios. */
export function ListCardList({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul aria-label={label} className="divide-y divide-border">
      {children}
    </ul>
  );
}

export interface ResponsiveListProps<T> {
  rows: T[];
  rowKey: (row: T) => string | number;
  /** Las columnas de la tabla (pantallas medianas para arriba). */
  columns: TableColumn<T>[];
  /** La tarjeta de cada fila (teléfono). */
  card: (row: T) => ListCardProps;
  /** Click en la fila de la tabla. En las tarjetas va por `card().onOpen`. */
  onRowClick?: (row: T) => void;
  emptyState?: ReactNode;
  /** Nombre accesible de la lista de tarjetas. */
  label?: string;
}

/**
 * Tabla o tarjetas según la pantalla, con los mismos datos. Monta una sola de
 * las dos (ver useMediaQuery).
 */
export function ResponsiveList<T>({
  rows,
  rowKey,
  columns,
  card,
  onRowClick,
  emptyState,
  label,
}: ResponsiveListProps<T>) {
  const mobile = useIsMobile();
  if (!mobile) {
    return (
      <Table columns={columns} rows={rows} rowKey={rowKey} onRowClick={onRowClick} emptyState={emptyState} />
    );
  }
  if (rows.length === 0) return <>{emptyState}</>;
  return (
    <ListCardList label={label}>
      {rows.map((row) => (
        <ListCard key={rowKey(row)} {...card(row)} />
      ))}
    </ListCardList>
  );
}
