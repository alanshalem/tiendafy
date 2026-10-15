import { BadgeCheck } from 'lucide-react';
import { Spinner } from '@tiendafy/ui';

/** Fragmentos compartidos por las cards de conexión (Mercado Pago, WhatsApp). */

export function ConnectedBadge() {
  return (
    <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-success-bg px-3 py-1 text-xs font-semibold text-success">
      <BadgeCheck className="h-4 w-4" /> Conectada
    </span>
  );
}

export function ConnectionLoading() {
  return (
    <div className="flex items-center gap-2 py-6 text-sm text-fg-muted">
      <Spinner inline /> Cargando estado de la conexión…
    </div>
  );
}
