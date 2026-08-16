import { Loader2 } from 'lucide-react';
import { Button } from '@tiendafy/ui';

/** Piezas de UI compartidas por los modales de envío (Correo Argentino, Zipnova). */

export const shipmentLabelCls = 'mb-1 block text-xs font-medium text-fg';

export function ShipmentFooter({
  busy,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <>
      <Button variant="secondary" onClick={onClose}>
        Cancelar
      </Button>
      <Button onClick={onSubmit} disabled={busy}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Crear envío
      </Button>
    </>
  );
}
