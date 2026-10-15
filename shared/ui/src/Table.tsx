import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { cn } from './cn';

/** Lo que dentro de una fila tiene su propio click: no abre la fila. */
const OWN_CLICK = 'a, button, input, select, textarea, label, [role="menuitem"], [role="checkbox"]';

/**
 * Props para una fila de tabla que abre algo (un detalle, una ficha).
 *
 * Un `<tr onClick>` solo no se alcanza con el teclado: quien no usa mouse no
 * tenía forma de abrir una venta o un presupuesto. Con esto la fila entra en
 * el orden de Tab, se abre con Enter o Espacio y muestra el foco.
 *
 * Con `focusable: false` la fila solo se ocupa del mouse; es para cuando la
 * primera celda ya tiene un link o un botón que hace lo mismo (no tiene
 * sentido pasar dos veces por lo mismo con Tab).
 *
 * Los clicks en un control propio de la fila (un botón, un link, un checkbox)
 * no la abren: hacen lo suyo.
 */
export function clickableRowProps(
  onActivate: () => void,
  { focusable = true }: { focusable?: boolean } = {},
) {
  return {
    tabIndex: focusable ? 0 : undefined,
    onClick: (e: MouseEvent<HTMLElement>) => {
      const target = e.target as HTMLElement;
      if (target !== e.currentTarget && target.closest(OWN_CLICK)) return;
      onActivate();
    },
    onKeyDown: focusable
      ? (e: KeyboardEvent<HTMLElement>) => {
          // Solo la fila con el foco: un Enter en un botón de adentro es del botón.
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onActivate();
          }
        }
      : undefined,
    className: cn(
      'cursor-pointer',
      focusable &&
        'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary',
    ),
  };
}

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
  /**
   * Con `false`, la fila responde al mouse pero no entra en el orden de Tab:
   * para cuando la primera celda ya es un link a lo mismo (ver clickableRowProps).
   */
  rowFocusable?: boolean;
  /** Mostrado cuando rows está vacío. */
  emptyState?: ReactNode;
  /** Clases del contenedor (márgenes, ancho). */
  className?: string;
  /** Clases del `<table>`: un ancho mínimo para que en el teléfono corra de costado. */
  tableClassName?: string;
  /** Clases por fila: atenuar una inactiva, resaltar una con problemas. */
  rowClassName?: (row: T) => string | undefined;
}

const alignClasses = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

/**
 * Las clases del encabezado de toda tabla del panel, también de las que se
 * arman a mano (las que tienen filas desplegables o celdas editables y no
 * entran en <Table>). Había encabezados en MAYÚSCULAS y otros no según la
 * pantalla; quedan en minúscula con la primera en mayúscula, que se lee mejor
 * en columnas angostas.
 */
export const TABLE_TH = 'bg-bg-subtle px-4 py-2.5 text-xs font-medium text-fg-muted';

/** Tabla tipada para listados de admin (productos, pedidos, clientes). */
export function Table<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  rowFocusable = true,
  emptyState,
  className,
  tableClassName,
  rowClassName,
}: TableProps<T>) {
  if (rows.length === 0 && emptyState) {
    return <div className="px-4 py-12 text-center text-sm text-fg-muted">{emptyState}</div>;
  }

  return (
    // El scroll de costado solo hace falta en pantalla chica: en grande estas
    // tablas entran sobradas. Y mientras el envoltorio sea contenedor de
    // scroll, el `sticky` del encabezado se ancla a él —que no scrollea— en vez
    // de a la página, así que dejar de serlo es la condición para que funcione.
    <div className={cn('overflow-x-auto lg:overflow-x-visible', className)}>
      <table className={cn('w-full border-collapse text-sm', tableClassName)}>
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
                  TABLE_TH,
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
          {rows.map((row) => {
            const clickable = onRowClick
              ? clickableRowProps(() => onRowClick(row), { focusable: rowFocusable })
              : null;
            return (
              <tr
                key={rowKey(row)}
                {...clickable}
                className={cn(
                  'border-b border-border last:border-b-0',
                  clickable && 'hover:bg-bg-subtle',
                  clickable?.className,
                  rowClassName?.(row),
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
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
