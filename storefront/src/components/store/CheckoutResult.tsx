'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Clock, XCircle, Loader2 } from 'lucide-react';

import { API_URL as API, clientJsonTenant, tenantHeaders } from '@/lib/api-client';
import { finishPurchase } from '@/lib/cart-storage';
import { trackingHref, type OrderView } from '@/lib/orders';
import { OrderSummary } from './OrderSummary';
import { OrderPaymentInstructions } from './OrderPaymentInstructions';
import { usePreviewHref } from './preview';

type Kind = 'success' | 'failure' | 'pending';

/**
 * Muestra el resultado del checkout. NO confía en los query params del redirect:
 * consulta el estado real de la orden server-side (que el webhook concilió).
 */
export function CheckoutResult({
  tenantId,
  orderId,
  kind,
}: {
  tenantId: string;
  orderId?: string;
  kind: Kind;
}) {
  const href = usePreviewHref();
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(orderId));
  // El pedido entero (productos, totales, envío): lo que el comprador quiere
  // revisar apenas paga. Si no carga, la pantalla sigue andando sin él.
  const [order, setOrder] = useState<OrderView | null>(null);

  // Mensaje propio del comercio para esta pantalla: cuándo despacha, cómo
  // sigue el pedido, a qué WhatsApp escribir. Es lo primero que el comprador
  // se pregunta apenas paga, y hasta ahora no había dónde contestarlo.
  const [ownMessage, setOwnMessage] = useState('');

  useEffect(() => {
    let active = true;
    fetch(`${API}/api/v1/checkout-settings`, { headers: tenantHeaders(tenantId) })
      .then((r) => r.json())
      .then((d: { orderMessageEnabled?: boolean; orderMessageText?: string }) => {
        if (active && d.orderMessageEnabled) setOwnMessage((d.orderMessageText ?? '').trim());
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [tenantId]);

  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      return;
    }
    let active = true;
    let tries = 0;
    const poll = async () => {
      try {
        const res = await fetch(`${API}/api/v1/orders/${orderId}/status`, {
          headers: tenantHeaders(tenantId),
        });
        if (res.ok) {
          const order = await res.json();
          if (!active) return;
          setStatus(order.status);
          if (['PAID', 'FAILED', 'CANCELLED', 'REFUNDED'].includes(order.status)) {
            setLoading(false);
            return;
          }
        }
      } catch {
        /* reintenta */
      }
      tries += 1;
      if (active && tries < 8) setTimeout(poll, 2000);
      else if (active) setLoading(false);
    };
    poll();
    return () => {
      active = false;
    };
  }, [orderId, tenantId]);

  // El resumen se pide al entrar y otra vez cuando el estado cambia: el paso
  // de "pendiente" a "pagado" cambia lo que sigue.
  useEffect(() => {
    if (!orderId) return;
    let active = true;
    clientJsonTenant<OrderView>(`/api/v1/orders/${orderId}/summary`, tenantId).then((o) => {
      if (active && o) setOrder(o);
    });
    return () => {
      active = false;
    };
  }, [orderId, tenantId, status]);

  // Estado real de la orden manda; el `kind` del redirect es solo una pista inicial.
  const resolved: Kind =
    status === 'PAID'
      ? 'success'
      : status === 'FAILED' || status === 'CANCELLED'
        ? 'failure'
        : status === 'PENDINGPAYMENT'
          ? 'pending'
          : kind;

  // Compra confirmada → el carrito se vacía. Solo con la orden en la mano y
  // ya resuelta (no mientras se sigue preguntando): un pago pendiente o
  // rechazado deja el carrito como estaba para volver a intentar. Si Mercado
  // Pago trajo al comprador hasta acá, el carrito de la página se acaba de
  // montar y se entera por el evento que dispara finishPurchase.
  const confirmed = resolved === 'success' && !loading && Boolean(orderId);
  useEffect(() => {
    if (confirmed && orderId) finishPurchase(tenantId, orderId);
  }, [confirmed, orderId, tenantId]);

  const view = {
    success: {
      icon: <CheckCircle2 className="h-14 w-14 text-green-600" />,
      title: '¡Pago aprobado!',
      text: 'Recibimos tu pago. Te enviamos la confirmación por email.',
    },
    pending: {
      icon: loading ? (
        <Loader2 className="h-14 w-14 animate-spin text-fg-muted" />
      ) : (
        <Clock className="h-14 w-14 text-amber-500" />
      ),
      title: loading ? 'Confirmando tu pago…' : 'Pago pendiente',
      text: loading
        ? 'Estamos verificando el pago con el medio de pago.'
        : 'Tu pago quedó pendiente. Te avisamos por email cuando se acredite.',
    },
    failure: {
      icon: <XCircle className="h-14 w-14 text-red-600" />,
      title: 'No se pudo completar el pago',
      text: 'El pago fue rechazado o cancelado. Podés intentar de nuevo desde tu carrito.',
    },
  }[resolved];

  // En un pago rechazado no hay pedido del que hablar.
  const showOrder = order && resolved !== 'failure';

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      {view.icon}
      <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
        {view.title}
      </h1>
      <p className="max-w-md text-fg-muted">{view.text}</p>
      {/* Solo cuando la compra salió bien o quedó esperando el pago: en un pago
          rechazado no hay pedido del que hablar. */}
      {ownMessage && resolved !== 'failure' && (
        <p className="max-w-md whitespace-pre-line rounded-lg border border-[rgb(var(--color-fg)/0.12)] bg-[rgb(var(--color-fg)/0.04)] px-4 py-3 text-sm">
          {ownMessage}
        </p>
      )}
      {showOrder && (
        <div className="w-full">
          <OrderSummary order={order}>
            <OrderPaymentInstructions order={{ ...order, status: status ?? order.status }} />
          </OrderSummary>
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        {showOrder && (
          <Link
            href={href(trackingHref(order.trackingToken))}
            className="rounded-md border border-[rgb(var(--color-fg)/0.2)] px-5 py-2.5 text-sm font-semibold hover:bg-[rgb(var(--color-fg)/0.05)]"
          >
            Seguí tu pedido
          </Link>
        )}
        <a
          href={href('/')}
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-fg"
        >
          Volver a la tienda
        </a>
      </div>
    </main>
  );
}
