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
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-bg-subtle">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn(
                  'px-4 py-2.5 font-medium text-fg-muted',
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
