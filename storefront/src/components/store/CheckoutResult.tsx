'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, XCircle, Loader2 } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5080';

type Kind = 'success' | 'failure' | 'pending';

/**
 * Muestra el resultado del checkout. NO confía en los query params del redirect:
 * consulta el estado real de la orden server-side (que el webhook concilió).
 */
export function CheckoutResult({ tenantId, orderId, kind }: { tenantId: string; orderId?: string; kind: Kind }) {
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(orderId));

  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      return;
    }
    let active = true;
    let tries = 0;
    const poll = async () => {
      try {
        const res = await fetch(`${API}/api/v1/orders/${orderId}`, { headers: { 'X-Tenant-Id': tenantId } });
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

  // Estado real de la orden manda; el `kind` del redirect es solo una pista inicial.
  const resolved: Kind =
    status === 'PAID' ? 'success' : status === 'FAILED' || status === 'CANCELLED' ? 'failure' : status === 'PENDINGPAYMENT' ? 'pending' : kind;

  const view = {
    success: {
      icon: <CheckCircle2 className="h-14 w-14 text-green-600" />,
      title: '¡Pago aprobado!',
      text: 'Recibimos tu pago. Te enviamos la confirmación por email.',
    },
    pending: {
      icon: loading ? <Loader2 className="h-14 w-14 animate-spin opacity-60" /> : <Clock className="h-14 w-14 text-amber-500" />,
      title: loading ? 'Confirmando tu pago…' : 'Pago pendiente',
      text: loading
        ? 'Estamos verificando el pago con Mercado Pago.'
        : 'Tu pago quedó pendiente (efectivo / transferencia). Te avisamos cuando se acredite.',
    },
    failure: {
      icon: <XCircle className="h-14 w-14 text-red-600" />,
      title: 'No se pudo completar el pago',
      text: 'El pago fue rechazado o cancelado. Podés intentar de nuevo desde tu carrito.',
    },
  }[resolved];

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-container flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      {view.icon}
      <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>{view.title}</h1>
      <p className="max-w-md opacity-70">{view.text}</p>
      {orderId && <p className="text-xs opacity-40">Orden {orderId}</p>}
      <a href="/" className="mt-2 rounded-md px-5 py-2.5 text-sm font-semibold text-primary-fg" style={{ background: 'rgb(var(--color-primary))' }}>
        Volver a la tienda
      </a>
    </main>
  );
}
