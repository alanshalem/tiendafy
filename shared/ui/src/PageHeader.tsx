import type { ReactNode } from 'react';
import { cn } from './cn';

export interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  /** Acciones a la derecha (ej. botón "Nuevo"). */
  actions?: ReactNode;
  className?: string;
}

/** Encabezado estándar de página del admin: título + bajada + acciones. */
export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <div>
        <h1 className="text-2xl font-bold text-fg">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-fg-muted">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}
