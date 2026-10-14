'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2, Search, Undo2 } from 'lucide-react';
import { useCart } from './cart';
import { usePreviewHref } from './preview';
import { OrderSummary, OrderTimeline } from './OrderSummary';
import { OrderPaymentInstructions } from './OrderPaymentInstructions';
import { BTN_SUBMIT_PUBLIC, INPUT_THEMED_11 } from './styles';
import { repentHref, trackOrder, type OrderView } from '@/lib/orders';

/**
 * "Seguí tu pedido", sin cuenta: con el email de la compra y el número de
 * pedido, o directo con el link firmado de los mails (`?t=`). `?pedido=`
 * deja el número ya escrito.
 */
export function OrderTracker({ token, initialNumber }: { token?: string; initialNumber?: string }) {
  const { tenantId } = useCart();
  const href = usePreviewHref();
  const id = useId();
  const [email, setEmail] = useState('');
  const [number, setNumber] = useState(initialNumber ?? '');
  const [busy, setBusy] = useState(Boolean(token));
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderView | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  // Con el link del mail, el pedido se abre solo. Si el link venció o está
  // roto, queda el formulario con el error.
  useEffect(() => {
    if (!token) return;
    let active = true;
    trackOrder(tenantId, { token }).then((r) => {
      if (!active) return;
      if (r.ok) setOrder(r.order);
      else setError('El link venció o no es válido. Buscá tu pedido con tu email y el número.');
      setBusy(false);
    });
    return () => {
      active = false;
    };
  }, [token, tenantId]);

  useEffect(() => {
    if (order) resultRef.current?.focus();
  }, [order]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await trackOrder(tenantId, { email: email.trim(), number: number.trim() });
    setBusy(false);
    if (r.ok) setOrder(r.order);
    else {
      setOrder(null);
      setError(r.error);
    }
  };

  return (
    <div>
      {!order && (
        <form onSubmit={submit} className="mt-6 space-y-4" aria-busy={busy}>
          <label htmlFor={`${id}-email`} className="block text-sm font-medium">
            Email de la compra
            <input
              id={`${id}-email`}
              type="email"
              required
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`${INPUT_THEMED_11} mt-1`}
            />
          </label>
          <label htmlFor={`${id}-number`} className="block text-sm font-medium">
            Número de pedido
            <input
              id={`${id}-number`}
              required
              inputMode="numeric"
              placeholder="Ej. #1042"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              className={`${INPUT_THEMED_11} mt-1`}
            />
            <span className="mt-1 block text-xs font-normal text-fg-muted">
              Está en el mail de confirmación de la compra.
            </span>
          </label>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy} className={BTN_SUBMIT_PUBLIC}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Search className="h-4 w-4" aria-hidden />
            )}
            Buscar pedido
          </button>
        </form>
      )}

      {order && (
        <div ref={resultRef} tabIndex={-1} className="mt-6 space-y-4 outline-none">
          <OrderTimeline steps={order.timeline} />
          <OrderSummary order={order}>
            <OrderPaymentInstructions order={order} />
          </OrderSummary>
          <div className="flex flex-wrap items-center gap-3">
            {order.canRepent && (
              <Link
                href={href(repentHref(order.number || order.label))}
                className="inline-flex items-center gap-2 rounded-md border border-[rgb(var(--color-fg)/0.18)] px-4 py-2.5 text-sm font-medium hover:bg-[rgb(var(--color-fg)/0.05)]"
              >
                <Undo2 className="h-4 w-4" aria-hidden /> Arrepentirme / devolver
              </Link>
            )}
            <button
              type="button"
              onClick={() => {
                setOrder(null);
                setError(null);
              }}
              className="text-sm font-medium text-primary-ink hover:underline"
            >
              Buscar otro pedido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
