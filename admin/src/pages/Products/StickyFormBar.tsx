import { type ReactNode } from 'react';
import { cn } from '@tiendafy/ui';
import { FIXED_BAR_PADDING } from '../../lib/styles';

/** Barra de acciones fija al pie de los formularios de producto (Cancelar + guardar). */
export function StickyFormBar({ children }: { children: ReactNode }) {
  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur md:left-sidebar',
        FIXED_BAR_PADDING,
      )}
    >
      <div className="flex items-center justify-end gap-3">{children}</div>
    </div>
  );
}
