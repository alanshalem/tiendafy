import type { ReactNode } from 'react';
import { cn } from './cn';

export interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Acciones a la derecha (ej. botón "Nuevo"); la principal va última. */
  actions?: ReactNode;
  /**
   * El conteo del listado ("1–25 de 45 ventas"). Va siempre en el mismo
   * lugar, debajo del título: antes cada pantalla lo ponía en otro (al lado
   * del título, arriba de la tabla, abajo de los filtros, en la bajada).
   */
  count?: ReactNode;
  /** Arriba del título: el link para volver al listado en una ficha. */
  back?: ReactNode;
  className?: string;
}

/**
 * Encabezado estándar de página del admin: título + bajada + conteo a la
 * izquierda y acciones arriba a la derecha.
 *
 * Había tres estilos de título (2xl en negrita, xl seminegrita y otro con
 * tracking apretado) según quién había hecho la pantalla.
 */
export function PageHeader({ title, subtitle, actions, count, back, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-x-4 gap-y-3', className)}>
      {/* Base 0 y un mínimo: el título se lleva el espacio que sobra y las
          acciones quedan arriba a la derecha aunque la bajada sea larga; en el
          teléfono, sin lugar para las dos cosas, las acciones bajan. */}
      <div className="min-w-[min(100%,18rem)] flex-[1_1_0%]">
        {back && <div className="mb-1">{back}</div>}
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold text-fg">{title}</h1>
        {subtitle && <div className="mt-0.5 text-sm text-fg-muted">{subtitle}</div>}
        {count && <p className="mt-1 text-xs text-fg-subtle">{count}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
