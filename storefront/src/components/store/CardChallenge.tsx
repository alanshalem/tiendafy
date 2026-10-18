'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StatusScreen } from '@mercadopago/sdk-react';
import { ShieldCheck } from 'lucide-react';

import { apiUrl, tenantHeaders } from '@/lib/api-client';

/**
 * Lo que devuelve `/checkout/{id}/pay-onsite` cuando el banco pide confirmar el
 * pago (3DS): el pago quedó `pending` / `pending_challenge` y la orden, pendiente.
 */
export interface CardChallengeData {
  orderId: string;
  paymentId: string;
  externalResourceUrl: string;
  creq: string;
}

type ChallengeOutcome = 'success' | 'pending' | 'failure';

/**
 * El desafío 3DS del banco ("confirmá que sos vos"), dentro de la tienda.
 *
 * Lo muestra el Status Screen Brick de Mercado Pago, como recomienda su guía
 * para Checkout Bricks: con el id del pago y el `three_ds_info` arma un iframe
 * y le postea el `creq` a la URL del banco. El desafío tiene que arrancar
 * dentro de los 30 segundos de creado el pago, así que se monta apenas vuelve
 * el cobro, y el comprador tiene unos 5 minutos para responderlo.
 *
 * Cuándo se sale de acá:
 * - El iframe avisa que el desafío terminó (`postMessage` con
 *   `{ status: 'COMPLETE' }`, el evento que documenta Mercado Pago). Ese aviso
 *   NO dice cómo salió: la pantalla de resultado consulta el estado real de la
 *   orden, que concilia el webhook. Por eso no hace falta validar de dónde
 *   viene el mensaje: lo peor que puede pasar es ir antes a esa pantalla.
 * - Mientras tanto se consulta la orden cada tanto: si el webhook ya la
 *   resolvió (aprobada, o rechazada porque el desafío falló o venció), se va
 *   directo al resultado aunque el aviso del iframe no llegue nunca.
 */
export function CardChallenge({
  tenantId,
  challenge,
  onDone,
  pollMs = 4000,
}: {
  tenantId: string;
  challenge: CardChallengeData;
  onDone: (outcome: ChallengeOutcome) => void;
  /** Cada cuánto se consulta la orden (los tests lo achican). */
  pollMs?: number;
}) {
  const [brickFailed, setBrickFailed] = useState(false);

  // Se sale una sola vez, aunque lleguen el aviso y la consulta juntos.
  const doneRef = useRef(onDone);
  const leftRef = useRef(false);
  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);
  const leave = useCallback((outcome: ChallengeOutcome) => {
    if (leftRef.current) return;
    leftRef.current = true;
    doneRef.current(outcome);
  }, []);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const data: unknown = e.data;
      if (data && typeof data === 'object' && (data as { status?: unknown }).status === 'COMPLETE')
        leave('pending');
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [leave]);

  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const res = await fetch(`${apiUrl()}/api/v1/orders/${challenge.orderId}/status`, {
          headers: tenantHeaders(tenantId),
        });
        if (!active || !res.ok) return;
        const { status } = (await res.json()) as { status?: string };
        if (status === 'PAID') leave('success');
        else if (status === 'FAILED' || status === 'CANCELLED') leave('failure');
      } catch {
        /* se vuelve a consultar en la próxima vuelta */
      }
    };
    const timer = setInterval(check, pollMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [challenge.orderId, tenantId, pollMs, leave]);

  // El Brick se vuelve a montar (y repostea el creq, que es de un solo uso)
  // si cambia cualquiera de estas props: van memorizadas.
  const initialization = useMemo(
    () => ({
      paymentId: challenge.paymentId,
      additionalInfo: { externalResourceURL: challenge.externalResourceUrl, creq: challenge.creq },
    }),
    [challenge.paymentId, challenge.externalResourceUrl, challenge.creq],
  );
  const onReady = useCallback(() => undefined, []);
  const onError = useCallback(() => setBrickFailed(true), []);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6 flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
        <div>
          <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
            Confirmá el pago con tu banco
          </h1>
          <p className="mt-1 text-sm text-fg-muted">
            Tu banco pide que confirmes que sos vos antes de aprobar el pago. Seguí los pasos que aparecen
            abajo. No cierres ni recargues esta página hasta terminar.
          </p>
        </div>
      </div>

      {brickFailed ? (
        <div role="alert" className="space-y-3 rounded-lg border border-fg/10 p-4 text-sm">
          <p>
            No pudimos mostrar la verificación de tu banco. Tu pedido quedó guardado: fijate cómo sigue el
            pago.
          </p>
          <button
            type="button"
            onClick={() => leave('pending')}
            className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-fg"
          >
            Ver el estado de mi compra
          </button>
        </div>
      ) : (
        // El iframe del banco trae un ancho mínimo propio: en un celular angosto
        // se puede deslizar de costado en vez de cortarse.
        <div className="overflow-x-auto">
          <StatusScreen initialization={initialization} locale="es-AR" onReady={onReady} onError={onError} />
        </div>
      )}
    </main>
  );
}
