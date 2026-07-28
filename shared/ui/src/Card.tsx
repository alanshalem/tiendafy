import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Header con borde inferior. */
  title?: ReactNode;
  /** Acción a la derecha del título (botón, link). */
  action?: ReactNode;
  /** Footer con borde superior (botones de form, paginación). */
  footer?: ReactNode;
  /** Sin padding en el body (tablas edge-to-edge). */
  flush?: boolean;
}

export function Card({ title, action, footer, flush = false, className, children, ...props }: CardProps) {
  return (
    <div className={cn('rounded-lg border border-border bg-surface shadow-card', className)} {...props}>
      {(title || action) && (
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          {title && <h3 className="text-sm font-semibold text-fg">{title}</h3>}
          {action}
        </div>
      )}
      <div className={flush ? undefined : 'p-4'}>{children}</div>
      {footer && <div className="border-t border-border px-4 py-3">{footer}</div>}
    </div>
  );
}
