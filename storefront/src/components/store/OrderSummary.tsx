'use client';

import type { ReactNode } from 'react';
import { CheckCircle2, Circle, ExternalLink, MapPin, Store, Truck } from 'lucide-react';
import { formatDateTime, formatMoney } from '@tiendafy/types';
import type { OrderView } from '@/lib/orders';
import { orderStatusLabel } from '@/lib/orders';
import { StoreImage } from './StoreImage';

/** Borde y fondo suave con los colores de la tienda: se leen en temas claros y oscuros. */
export const CARD = 'rounded-2xl border border-[rgb(var(--color-fg)/0.12)] p-5';

/**
 * Lo que sigue después de comprar, según en qué está el pedido. Es lo primero
 * que se pregunta quien acaba de pagar ("¿y ahora qué?").
 */
export function nextStepText(order: Pick<OrderView, 'status' | 'isPickup'>): string | null {
  switch (order.status) {
    case 'PENDINGPAYMENT':
      return 'Apenas se acredite el pago te avisamos por email y empezamos a preparar el pedido.';
    case 'PAID':
      return order.isPickup
        ? 'Lo estamos preparando. Te avisamos por email cuando esté listo para retirar.'
        : 'Lo estamos preparando. Cuando lo despachemos te mandamos el seguimiento por email.';
    case 'FULFILLED':
      return order.isPickup ? 'Ya podés pasar a retirarlo.' : 'Tu pedido está en camino.';
    default:
      return null;
  }
}

/** El seguimiento como link (o el número solo, si no sabemos de qué correo es). */
export function TrackingLink({ tracking }: { tracking: OrderView['tracking'] }) {
  if (!tracking) return null;
  const text = [tracking.carrier, tracking.number].filter(Boolean).join(' · ') || 'Ver el envío';
  if (!tracking.url) return <span className="font-medium">{text}</span>;
  return (
    <a
      href={tracking.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-medium text-primary-ink underline-offset-2 hover:underline"
    >
      {text} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
      <span className="sr-only">(se abre en otra pestaña)</span>
    </a>
  );
}

/**
 * El resumen de un pedido: productos, totales, cómo llega y en qué está.
 * Lo usan la página de gracias, "Seguí tu pedido" y el detalle de la cuenta.
 * `children` va debajo de los totales (ej. los datos para transferir).
 */
export function OrderSummary({ order, children }: { order: OrderView; children?: ReactNode }) {
  const money = (m: { amount: number; currency: string }) => formatMoney(m.amount, m.currency);
  const next = nextStepText(order);

  return (
    <div className="space-y-4 text-left">
      <div className={CARD}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">Pedido {order.label}</h2>
          <span className="rounded-full bg-[rgb(var(--color-fg)/0.08)] px-2.5 py-0.5 text-xs font-semibold">
            {orderStatusLabel(order.status, order.isPickup)}
          </span>
        </div>
        <p className="mt-1 text-xs text-fg-muted">{formatDateTime(order.createdAtUtc)}</p>

        <ul className="mt-4 divide-y divide-[rgb(var(--color-fg)/0.08)]">
          {order.items.map((i) => (
            <li key={`${i.variantId}-${i.productName}`} className="flex items-center gap-3 py-3">
              {i.image ? (
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md">
                  <StoreImage src={i.image} alt="" sizes="56px" className="object-cover" />
                </div>
              ) : (
                <div className="h-14 w-14 shrink-0 rounded-md bg-[rgb(var(--color-fg)/0.06)]" aria-hidden />
              )}
              <div className="min-w-0 flex-1 text-sm">
                <div className="truncate font-medium">{i.productName}</div>
                {i.variantDescription && i.variantDescription !== 'Única' && (
                  <div className="text-xs text-fg-muted">{i.variantDescription}</div>
                )}
                <div className="text-xs text-fg-muted">x{i.quantity}</div>
              </div>
              <div className="text-sm font-medium tabular-nums">
                {formatMoney(i.unitPrice.amount * i.quantity, i.unitPrice.currency)}
              </div>
            </li>
          ))}
        </ul>

        <dl className="mt-3 space-y-1 border-t border-[rgb(var(--color-fg)/0.1)] pt-3 text-sm">
          <Row label="Subtotal" value={money(order.subtotal)} />
          {order.discount.amount > 0 && <Row label="Descuento" value={`- ${money(order.discount)}`} />}
          <Row
            label={order.isPickup ? 'Retiro' : 'Envío'}
            value={order.shipping.amount > 0 ? money(order.shipping) : 'Gratis'}
          />
          {order.refunded.amount > 0 && <Row label="Reembolsado" value={`- ${money(order.refunded)}`} />}
          <div className="flex justify-between pt-1 text-base font-bold">
            <dt>Total</dt>
            <dd className="tabular-nums">{money(order.total)}</dd>
          </div>
        </dl>
        {children}
      </div>

      <div className={`${CARD} space-y-2 text-sm`}>
        <div className="flex items-start gap-2.5">
          {order.isPickup ? (
            <Store className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <Truck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          )}
          <div>
            <div className="font-medium">
              {order.isPickup ? 'Retiro en el local' : 'Envío a domicilio'}
              {order.shippingMethod ? ` · ${order.shippingMethod}` : ''}
            </div>
            {order.isPickup && order.pickupAddress && (
              <div className="text-fg-muted">Retirás en: {order.pickupAddress}</div>
            )}
            {!order.isPickup && order.shippingAddress && (
              <div className="text-fg-muted">Lo enviamos a: {order.shippingAddress}</div>
            )}
          </div>
        </div>
        {order.tracking && (
          <div className="flex items-start gap-2.5">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div>
              Seguimiento: <TrackingLink tracking={order.tracking} />
            </div>
          </div>
        )}
        {next && <p className="text-fg-muted">{next}</p>}
        <p className="text-xs text-fg-muted">La confirmación fue a {order.buyerEmailHint}.</p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

/** Los pasos del pedido, con fecha en los que ya pasaron. */
export function OrderTimeline({ steps }: { steps: OrderView['timeline'] }) {
  return (
    <ol className={`${CARD} space-y-3`} aria-label="Estado del pedido">
      {steps.map((s) => (
        <li key={s.key} className="flex items-start gap-3 text-sm">
          {s.done ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary-ink" aria-hidden />
          ) : (
            <Circle className="mt-0.5 h-5 w-5 shrink-0 text-fg-muted" aria-hidden />
          )}
          <div>
            <div className={s.done ? 'font-medium' : 'text-fg-muted'}>
              {s.label}
              <span className="sr-only">{s.done ? ' (listo)' : ' (pendiente)'}</span>
            </div>
            {s.atUtc && <div className="text-xs text-fg-muted">{formatDateTime(s.atUtc)}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}
