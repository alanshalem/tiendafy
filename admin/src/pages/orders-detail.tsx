import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Ban, Banknote, PackageCheck, Truck, Undo2, UserRound } from 'lucide-react';
import { cn, Spinner } from '@tiendafy/ui';
import { formatDate, formatDateTime } from '../lib/format';
import { ORDER_STATUS } from '../lib/orderStatus';
import { ORDER_CHANNEL, ORDER_PAYMENT, ORDER_SHIPPING } from '../lib/orderFacets';
import { orderLabel } from '../lib/orderNumber';
import { CorreoShipmentButton } from '../components/CorreoShipment';
import { ZipnovaShipmentButton } from '../components/ZipnovaShipment';
import { AndreaniShipmentButton } from '../components/AndreaniShipment';
import { FiscalPanel } from './orders-fiscal';
import { money, type Order } from './Orders';

/** El pill de estado, con "Lista para retirar" para un retiro ya avisado. */
export function OrderStatusPill({ order }: { order: Order }) {
  const known = ORDER_STATUS[order.status] ?? { label: order.status, cls: 'bg-bg-muted text-fg-muted' };
  const st =
    order.isPickup && order.status === 'FULFILLED' ? { ...known, label: 'Lista para retirar' } : known;
  return (
    <span className={cn('whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold', st.cls)}>
      {st.label}
    </span>
  );
}

const SHIPPING_TONE = {
  warning: 'bg-warning-bg text-warning',
  success: 'bg-success-bg text-success',
  info: 'bg-info-bg text-info',
} as const;

/** En qué anda el envío (por despachar, enviada, lista para retirar); nada si no aplica. */
export function ShippingPill({ order }: { order: Order }) {
  const st = order.shippingStatus ? ORDER_SHIPPING[order.shippingStatus] : undefined;
  if (!st) return <span className="text-xs text-fg-subtle">—</span>;
  return (
    <span
      className={cn(
        'whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium',
        SHIPPING_TONE[st.tone],
      )}
    >
      {st.label}
    </span>
  );
}

export interface OrderActions {
  canFulfill: boolean;
  canRefund: boolean;
  canEmit: boolean;
  /** Cancelar una venta sin cobrar (la crea quien vende, o la anula quien reembolsa). */
  canCancel: boolean;
  onFulfill: (o: Order) => void;
  onRefund: (o: Order) => void;
  onCancel: (o: Order) => void;
  /** Transferencia o efectivo: registrar que la plata llegó (permiso de cargar ventas). */
  canRegisterPayment?: boolean;
  onRegisterPayment?: (o: Order) => void;
}

/**
 * El detalle de una venta: lo que compró, quién la compró (con su ficha), a
 * dónde va y con qué (envío, carrier y seguimiento), la facturación y lo que
 * se puede hacer con ella (despachar, generar el envío de un carrier,
 * reembolsar o, si nunca se cobró, cancelarla). Lo usan la fila desplegada
 * del listado, la tarjeta del celular y la venta que se abre por link aunque
 * no esté en la página.
 */
export function OrderDetail({
  order: o,
  busy,
  canFulfill,
  canRefund,
  canEmit,
  canCancel,
  onFulfill,
  onRefund,
  onCancel,
  canRegisterPayment = false,
  onRegisterPayment,
}: { order: Order; busy: boolean } & OrderActions) {
  const offline = o.paymentProvider === 'transfer' || o.paymentProvider === 'cash';
  const methodDiscount = o.paymentMethodDiscount?.amount ?? 0;
  const couponDiscount = (o.discount?.amount ?? 0) - methodDiscount;
  const paidLike = o.status === 'PAID' || o.status === 'FULFILLED' || o.status === 'PARTIALLYREFUNDED';
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="text-xs font-semibold text-fg-muted">Venta {orderLabel(o)}</div>
        {o.items.map((i) => (
          <div key={i.variantId} className="flex justify-between gap-3 text-xs">
            <span className="text-fg">
              {i.quantity}× {i.productName}
              {i.variantDescription ? ` · ${i.variantDescription}` : ''}
            </span>
            <span className="tabular-nums text-fg-muted">
              {money({ amount: i.unitPrice.amount * i.quantity, currency: i.unitPrice.currency })}
            </span>
          </div>
        ))}
        {o.discount && couponDiscount > 0 && (
          <div className="flex justify-between text-xs text-success">
            <span>Descuento{o.couponCode ? ` (${o.couponCode})` : ''}</span>
            <span className="tabular-nums">
              - {money({ amount: couponDiscount, currency: o.discount.currency })}
            </span>
          </div>
        )}
        {o.paymentMethodDiscount && methodDiscount > 0 && (
          <div className="flex justify-between text-xs text-success">
            <span>Descuento por {o.paymentProvider === 'cash' ? 'pago en efectivo' : 'transferencia'}</span>
            <span className="tabular-nums">- {money(o.paymentMethodDiscount)}</span>
          </div>
        )}
        {o.shipping && o.shipping.amount > 0 && (
          <div className="flex justify-between text-xs">
            <span className="text-fg">Envío{o.shippingMethod ? ` · ${o.shippingMethod}` : ''}</span>
            <span className="tabular-nums text-fg-muted">{money(o.shipping)}</span>
          </div>
        )}
      </div>

      <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
        <Fact label="Cliente">
          <span className="text-fg">{o.buyerName || o.buyerEmail}</span>
          {[o.buyerName ? o.buyerEmail : null, o.buyerPhone, o.docNumber ? `DNI/CUIT ${o.docNumber}` : null]
            .filter(Boolean)
            .map((line) => (
              <span key={line} className="block text-fg-muted">
                {line}
              </span>
            ))}
          {!isPlaceholderEmail(o.buyerEmail) && (
            <Link
              to={`/clientes?q=${encodeURIComponent(o.buyerEmail)}`}
              className="mt-0.5 inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              <UserRound className="h-3.5 w-3.5" aria-hidden="true" /> Ver en Clientes
            </Link>
          )}
        </Fact>
        <Fact label={o.isPickup ? 'Retiro' : 'Envío'}>
          <span className="text-fg">
            {o.isPickup ? 'Retira en el local' : o.shippingMethod || 'Sin medio de envío'}
            {o.isPickup && o.shippingMethod ? ` · ${o.shippingMethod}` : ''}
          </span>
          {o.shippingAddress && !o.isPickup && (
            <span className="block text-fg-muted">{o.shippingAddress}</span>
          )}
          {o.tracking ? (
            <span className="block text-fg-muted">
              Seguimiento: <span className="font-mono text-fg">{o.tracking}</span>
              {o.fulfilledAtUtc ? ` · enviada ${formatDate(o.fulfilledAtUtc)}` : ''}
            </span>
          ) : (
            o.fulfilledAtUtc && (
              <span className="block text-fg-muted">
                {o.isPickup ? 'Avisada para retirar' : 'Enviada sin seguimiento'} el{' '}
                {formatDate(o.fulfilledAtUtc)}
              </span>
            )
          )}
          {o.shippingStatus && (
            <span className="mt-1 block">
              <ShippingPill order={o} />
            </span>
          )}
        </Fact>
        <Fact label="Cobro">
          <span className="text-fg">
            {(o.paymentMethod && ORDER_PAYMENT[o.paymentMethod]) ||
              (o.paymentId ? 'Pago online' : 'Sin cobrar')}
          </span>
          {o.paymentId && !o.paymentId.startsWith('manual-') && (
            <span className="block text-fg-muted">
              Pago #{o.paymentId}
              {o.paidAtUtc ? ` · ${formatDateTime(o.paidAtUtc)}` : ''}
            </span>
          )}
        </Fact>
        {o.channel && (
          <Fact label="Canal">
            <span className="text-fg">{ORDER_CHANNEL[o.channel] ?? o.channel}</span>
          </Fact>
        )}
      </dl>

      {o.notes && <div className="text-xs italic text-fg-subtle">Nota: {o.notes}</div>}
      {o.refunded && o.refunded.amount > 0 && (
        <div className="text-xs font-medium text-info">
          Reembolsado: {money(o.refunded)}
          {o.refundable && o.refundable.amount > 0 ? ` · queda ${money(o.refundable)}` : ' (total)'}
        </div>
      )}
      {o.status === 'CANCELLED' && o.cancelledAtUtc && (
        <div className="text-xs text-fg-muted">
          Cancelada el {formatDateTime(o.cancelledAtUtc)}
          {o.cancelledBy ? ` por ${o.cancelledBy}` : ''}
          {o.cancelReason ? `: ${o.cancelReason}` : '.'}
        </div>
      )}
      {(paidLike || o.status === 'REFUNDED') && (
        <FiscalPanel
          orderId={o.id}
          orderStatus={o.status}
          buyerDoc={o.docNumber}
          canEmit={canEmit}
          currency={o.currency}
          refunded={o.refunded?.amount ?? 0}
        />
      )}
      {offline && o.status === 'PENDINGPAYMENT' && (
        <div className="rounded-md border border-warning/40 bg-warning-bg px-3 py-2 text-xs text-warning">
          {o.paymentProvider === 'cash' ? 'Paga en efectivo al retirar' : 'Paga por transferencia'}: falta
          registrar el pago
          {o.paymentDueAtUtc ? `. Si no, se cancela sola el ${formatDateTime(o.paymentDueAtUtc)}.` : '.'}
        </div>
      )}
      {offline && o.status === 'PENDINGPAYMENT' && canRegisterPayment && onRegisterPayment && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => onRegisterPayment(o)}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Spinner inline size={14} /> : <Banknote className="h-3.5 w-3.5" />} Registrar pago
          </button>
        </div>
      )}
      {o.status === 'PENDINGPAYMENT' && canCancel && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => onCancel(o)}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-danger/40 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger-bg disabled:opacity-50"
          >
            {busy ? <Spinner inline size={14} /> : <Ban className="h-3.5 w-3.5" />} Cancelar venta
          </button>
          <span className="text-xs text-fg-subtle">
            Todavía no se cobró: cancelarla anula el link de pago y libera el stock reservado.
          </span>
        </div>
      )}
      {paidLike && (canFulfill || canRefund) && (
        <div className="flex flex-wrap gap-2 pt-1">
          {o.status === 'PAID' && canFulfill && (
            <button
              type="button"
              onClick={() => onFulfill(o)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg hover:opacity-90 disabled:opacity-50"
            >
              {busy ? (
                <Spinner inline size={14} />
              ) : o.isPickup ? (
                <PackageCheck className="h-3.5 w-3.5" />
              ) : (
                <Truck className="h-3.5 w-3.5" />
              )}{' '}
              {o.isPickup ? 'Lista para retirar' : 'Marcar enviada'}
            </button>
          )}
          {/* Los carriers no aplican a un pedido que se retira en el local. */}
          {/* Despachada sigue mostrando el envío de cada carrier, con su seguimiento. */}
          {(o.status === 'PAID' || o.status === 'FULFILLED') && canFulfill && !o.isPickup && (
            <>
              <CorreoShipmentButton order={o} />
              <ZipnovaShipmentButton order={o} />
              <AndreaniShipmentButton order={o} />
            </>
          )}
          {o.status === 'FULFILLED' && canFulfill && !o.isPickup && (
            <button
              type="button"
              onClick={() => onFulfill(o)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-fg hover:bg-bg-muted disabled:opacity-50"
            >
              <Truck className="h-3.5 w-3.5" /> Editar seguimiento
            </button>
          )}
          {o.paymentId && canRefund && (
            <button
              type="button"
              onClick={() => onRefund(o)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-danger/40 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger-bg disabled:opacity-50"
            >
              {busy ? <Spinner inline size={14} /> : <Undo2 className="h-3.5 w-3.5" />} Reembolsar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="font-semibold text-fg-muted">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

/** Las ventas manuales sin email llevan uno inventado: no hay ficha que buscar. */
const isPlaceholderEmail = (email: string) => email.endsWith('@sin-email.local');
