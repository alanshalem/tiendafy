import type { ReactNode } from 'react';
import { cn } from './cn';

export interface TableColumn<T> {
  key: string;
  header: ReactNode;
  /** Render de celda. Default: `row[key]` si existe. */
  cell?: (row: T) => ReactNode;
  /** Alineación de la columna. */
  align?: 'left' | 'center' | 'right';
  className?: string;
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  /** Key estable por fila (id de entidad). */
  rowKey: (row: T) => string | number;
  /** Click en fila (navegar a detalle). */
  onRowClick?: (row: T) => void;
  /** Mostrado cuando rows está vacío. */
  emptyState?: ReactNode;
  className?: string;
}

const alignClasses = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

/** Tabla tipada para listados de admin (productos, pedidos, clientes). */
export function Table<T>({ columns, rows, rowKey, onRowClick, emptyState, className }: TableProps<T>) {
  if (rows.length === 0 && emptyState) {
    return <div className="px-4 py-12 text-center text-sm text-fg-muted">{emptyState}</div>;
  }

  return (
    // El scroll de costado solo hace falta en pantalla chica: en grande estas
    // tablas entran sobradas. Y mientras el envoltorio sea contenedor de
    // scroll, el `sticky` del encabezado se ancla a él —que no scrollea— en vez
    // de a la página, así que dejar de serlo es la condición para que funcione.
    <div className={cn('overflow-x-auto lg:overflow-x-visible', className)}>
      <table className="w-full border-collapse text-sm">
        {/* El fondo va en cada `th` y no en el `tr`: el elemento fijo pinta su
            propio fondo y el de la fila queda debajo, así que las filas se le
            verían a través. El borde inferior va como sombra porque con bordes
            colapsados lo pinta la tabla y bajo una celda fija desaparece.
            Fijo solo desde lg, igual que el scroll: debajo, anclado al
            envoltorio, el corrimiento del header de la página lo bajaba justo
            encima de la primera fila y la tapaba entera. */}
        <thead className="z-10 lg:sticky lg:top-[var(--header-height)]">
          <tr className="border-b border-border">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn(
                  'bg-bg-subtle px-4 py-2.5 font-medium text-fg-muted',
                  'shadow-[inset_0_-1px_0_rgb(var(--color-border))]',
                  alignClasses[col.align ?? 'left'],
                  col.className,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                'border-b border-border last:border-b-0',
                onRowClick && 'cursor-pointer hover:bg-bg-subtle',
              )}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn('px-4 py-3 text-fg', alignClasses[col.align ?? 'left'], col.className)}
                >
                  {col.cell ? col.cell(row) : String((row as Record<string, unknown>)[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
