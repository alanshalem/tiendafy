import type { ReactNode } from 'react';
import { cn } from './cn';

export interface EmptyListProps {
  children: ReactNode;
  className?: string;
}

/** Estado vacío de una lista: caja punteada con el texto explicativo. */
export function EmptyList({ children, className }: EmptyListProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-dashed border-border bg-surface/50 p-10 text-center text-sm text-fg-muted',
        className,
      )}
    >
      {children}
    </div>
  );
}
