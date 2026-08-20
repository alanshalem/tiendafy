import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn, buildPageWindow } from '@tiendafy/ui';

/**
 * Paginado client-side de una lista ya filtrada (antes copiado entre Costos e
 * Inventario). La página queda clampeada al total; al cambiar el filtro,
 * llamá setPage(1) desde el onChange del input.
 */
export function usePagedList<T>(items: T[], pageSize = 20) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const pageClamped = Math.min(page, totalPages);
  const pageItems = items.slice((pageClamped - 1) * pageSize, pageClamped * pageSize);
  return { page: pageClamped, setPage, totalPages, pageItems };
}

/** Paginador: ‹ 1 … (p-1) p (p+1) … N › */
export function Pagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  const win = buildPageWindow(page, totalPages);

  return (
    <nav className="flex items-center justify-center gap-1.5 pt-3">
      <Btn disabled={page <= 1} onClick={() => onPage(page - 1)} label="Anterior">
        <ChevronLeft className="h-4 w-4" />
      </Btn>
      {win.map((n, i) =>
        n === null ? (
          <span key={`gap-${i}`} className="px-1 text-fg-subtle">
            …
          </span>
        ) : (
          <Btn key={n} active={n === page} onClick={() => onPage(n)}>
            {n}
          </Btn>
        ),
      )}
      <Btn disabled={page >= totalPages} onClick={() => onPage(page + 1)} label="Siguiente">
        <ChevronRight className="h-4 w-4" />
      </Btn>
    </nav>
  );
}

function Btn({
  children,
  active,
  disabled,
  onClick,
  label,
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-9 min-w-9 items-center justify-center rounded-md border px-2 text-sm transition-colors disabled:opacity-30',
        active
          ? 'border-transparent bg-primary font-semibold text-primary-fg'
          : 'border-border-strong text-fg hover:bg-bg-muted',
      )}
    >
      {children}
    </button>
  );
}

/**
 * "1–25 de 45 ventas" — el rango visible sobre el total. Sin esto, una lista
 * con menos filas que el tamaño de página parece no tener paginación: el
 * paginador se oculta (con razón) y nada dice cuántas cosas hay en total.
 */
export function pageRangeLabel(page: number, pageSize: number, total: number, noun: string): string {
  if (total === 0) return `Sin ${noun}`;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  const range = first === last ? `${first}` : `${first}–${last}`;
  return `${range} de ${total.toLocaleString('es-AR')} ${noun}`;
}
