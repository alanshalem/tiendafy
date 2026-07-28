import { type ReactNode } from 'react';

/** Barra de acciones fija al pie de los formularios de producto (Cancelar + guardar). */
export function StickyFormBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 px-6 py-3 backdrop-blur md:left-sidebar">
      <div className="mx-auto flex max-w-2xl items-center justify-end gap-3">{children}</div>
    </div>
  );
}
