import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn, buildPageWindow } from '@tiendafy/ui';

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
