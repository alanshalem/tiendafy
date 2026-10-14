import type { HTMLAttributes } from 'react';
import { cn } from './cn';

export type BadgeVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'primary';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

/**
 * Las clases de cada tono, con los tokens semánticos (que tienen su versión
 * oscura). Exportadas para lo que no es un <Badge> pero pinta un estado igual
 * —una celda, un puntito de leyenda—: antes esos lugares usaban la paleta
 * cruda de Tailwind (`bg-green-100 text-green-700`), que en modo oscuro
 * quedaba como una mancha clara con letra ilegible.
 */
export const badgeVariantClass: Record<BadgeVariant, string> = {
  neutral: 'bg-bg-muted text-fg-muted',
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning',
  danger: 'bg-danger-bg text-danger',
  info: 'bg-info-bg text-info',
  primary: 'bg-primary/10 text-primary',
};

/** Etiqueta de estado: pedidos (CONFIRMED), pagos (PENDING), stock, planes. */
export function Badge({ variant = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium',
        badgeVariantClass[variant],
        className,
      )}
      {...props}
    />
  );
}
