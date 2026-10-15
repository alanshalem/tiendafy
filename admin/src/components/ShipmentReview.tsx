import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Spinner, useConfirm, usePrompt, useToast } from '@tiendafy/ui';
import { api, errMsg } from '../lib/api';
import { shipmentTriggerCls } from '../lib/shipping';

/** Lo que devuelve el GET del envío cuando el carrier lo creó y no quedó guardado acá. */
export interface ShipmentReviewState {
  /** Lo que respondió el carrier (número de seguimiento, id de envío). */
  note: string | null;
  claimedAtUtc: string;
}

/**
 * Aviso de un envío que el carrier pudo haber creado sin que quedara guardado
 * en Tiendafy. Mientras está, la venta no deja crear otro (sería un duplicado
 * que se paga). Se resuelve mirando el panel del carrier:
 *
 * - "No se creó": se libera y se puede crear de nuevo. Pide confirmación,
 *   porque si en realidad sí se creó, sale un envío duplicado.
 * - "Se creó": se carga el número que figura en el carrier y queda como un
 *   envío normal. Sin `numberLabel` (MiCorreo no da número al dar de alta),
 *   solo se registra que está hecho.
 *
 * `onResolved` recibe lo que el botón del carrier tiene que mostrar después:
 * el envío cargado, o `{ exists: false }` para volver a ofrecer crearlo.
 */
export function ShipmentReviewNotice<T extends { exists: boolean }>({
  orderId,
  carrier,
  carrierName,
  review,
  numberLabel,
  onResolved,
}: {
  orderId: string;
  /** El tramo de la URL: andreani, zipnova, correo. */
  carrier: 'andreani' | 'zipnova' | 'correo';
  carrierName: string;
  review: ShipmentReviewState;
  numberLabel: string | null;
  onResolved: (state: T | { exists: false }) => void;
}) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [busy, setBusy] = useState(false);
  const base = `/api/v1/admin/orders/${orderId}/${carrier}-shipment/review`;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      toast(errMsg(e, 'No se pudo resolver el envío.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const release = async () => {
    const ok = await confirm({
      title: `¿No se creó en ${carrierName}?`,
      message: `Confirmá solo si revisaste el panel de ${carrierName} y el envío de esta venta no está. Si en realidad se creó, al volver a crearlo vas a tener un envío duplicado que se paga.`,
      confirmLabel: 'No se creó: liberar',
      variant: 'danger',
    });
    if (!ok) return;
    await run(async () => {
      await api.post(`${base}/release`, {});
      onResolved({ exists: false });
      toast('Listo: ya podés volver a crear el envío.', { variant: 'success' });
    });
  };

  const record = async () => {
    let number: string | null = null;
    if (numberLabel) {
      number = await prompt({
        title: `Cargar el envío de ${carrierName}`,
        message: numberLabel,
        confirmLabel: 'Guardar',
      });
      if (number === null) return;
      if (!number.trim()) {
        toast('Cargá el número tal como figura en el panel del carrier.', { variant: 'error' });
        return;
      }
    } else {
      const ok = await confirm({
        title: `¿Se creó en ${carrierName}?`,
        message: `Queda registrado que esta venta ya está dada de alta en ${carrierName}. El número de seguimiento lo cargás con “Marcar enviada” cuando lo tengas.`,
        confirmLabel: 'Se creó: registrarlo',
      });
      if (!ok) return;
    }
    await run(async () => {
      const saved = await api.post<T>(`${base}/record`, { number: number?.trim() ?? null });
      onResolved(saved);
      toast('Envío registrado.', { variant: 'success' });
    });
  };

  return (
    <div
      role="alert"
      className="flex w-full flex-col gap-2 rounded-md border border-warning/40 bg-warning-bg px-3 py-2 text-xs text-fg"
    >
      <p className="flex items-start gap-1.5">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
        <span>
          <b>Puede que {carrierName} haya creado el envío de esta venta, pero no quedó guardado acá.</b>{' '}
          Revisá el panel de {carrierName} antes de seguir: crear otro sería un envío duplicado que se paga.
          {review.note && (
            <>
              {' '}
              Lo que respondió {carrierName}: <span className="font-medium">{review.note}</span>.
            </>
          )}
        </span>
      </p>
      <span className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={record}
          disabled={busy}
          className={`${shipmentTriggerCls} disabled:opacity-50`}
        >
          {busy && <Spinner inline size={14} />}{' '}
          {numberLabel ? 'Se creó: cargar el número' : 'Se creó: registrarlo'}
        </button>
        <button
          type="button"
          onClick={release}
          disabled={busy}
          className={`${shipmentTriggerCls} disabled:opacity-50`}
        >
          Ya lo revisé: no se creó
        </button>
      </span>
    </div>
  );
}
