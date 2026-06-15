import type { ReactNode } from 'react';
import { cn } from './cn';

export interface PaginationProps {
  /** Hay página siguiente (la API por cursor lo devuelve como has_more). */
  hasNext: boolean;
  hasPrev: boolean;
  onNext: () => void;
  onPrev: () => void;
  /** Texto informativo: "Mostrando 1–20 de 142". */
  summary?: ReactNode;
  className?: string;
}

/**
 * Paginación por cursor (prev/next), alineada con la API pública —
 * paginación por offset muere con tablas grandes, no se modela acá.
 */
export function Pagination({ hasNext, hasPrev, onNext, onPrev, summary, className }: PaginationProps) {
  const buttonClass = cn(
    'inline-flex h-9 items-center rounded-md border border-border-strong bg-surface px-3 text-sm font-medium text-fg',
    'hover:bg-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
    'disabled:pointer-events-none disabled:opacity-50',
  );

  return (
    <nav aria-label="Paginación" className={cn('flex items-center justify-between gap-4', className)}>
      <div className="text-sm text-fg-muted">{summary}</div>
      <div className="flex gap-2">
        <button type="button" onClick={onPrev} disabled={!hasPrev} className={buttonClass}>
          Anterior
        </button>
        <button type="button" onClick={onNext} disabled={!hasNext} className={buttonClass}>
          Siguiente
        </button>
      </div>
    </nav>
  );
}
