import type { ReactNode } from 'react';

/**
 * Diálogo simple con backdrop (click afuera = cerrar). Chrome distinto al
 * Modal de @tiendafy/ui (rounded-xl, sin header/footer con bordes) — se usa
 * en los diálogos compactos de Ventas y Medios de envío.
 */
export function PlainDialog({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
