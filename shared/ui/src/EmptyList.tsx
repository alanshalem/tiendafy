import type { ReactNode } from 'react';
import { cn } from './cn';

export interface EmptyListProps {
  /** Ícono arriba (un lucide de 32 px). */
  icon?: ReactNode;
  /** Qué pasa, en una línea: "Todavía no cargaste proveedores". */
  title?: ReactNode;
  /** La explicación (o el texto entero si no hay título). */
  children?: ReactNode;
  className?: string;
}

/**
 * Estado vacío de una lista: caja punteada con el texto explicativo.
 *
 * Con ícono y título cubre también la variante "grande" que varias pantallas
 * copiaban a mano, clase por clase (ícono, renglón en negrita, bajada).
 */
export function EmptyList({ icon, title, children, className }: EmptyListProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-dashed border-border bg-surface/50 p-10 text-center text-sm text-fg-muted',
        className,
      )}
    >
      {icon && <div className="mb-2 flex justify-center text-fg-subtle [&>svg]:h-8 [&>svg]:w-8">{icon}</div>}
      {title && <p className="font-medium text-fg">{title}</p>}
      {children && (title ? <div className="mt-1">{children}</div> : children)}
    </div>
  );
}
