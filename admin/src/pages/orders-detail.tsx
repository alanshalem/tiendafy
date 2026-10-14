import { Banknote, Loader2, PackageCheck, Truck, Undo2, XCircle } from 'lucide-react';
import { cn } from '@tiendafy/ui';
import { formatDate, formatDateTime } from '../lib/format';
import { ORDER_STATUS } from '../lib/orderStatus';
import { orderLabel } from '../lib/orderNumber';
import { CorreoShipmentButton } from '../components/CorreoShipment';
import { ZipnovaShipmentButton } from '../components/ZipnovaShipment';
import { AndreaniShipmentButton } from '../components/AndreaniShipment';
import { FiscalPanel } from './orders-fiscal';
import { money, type Order } from './Orders';

/** El pill de estado, con "Lista para retirar" para un retiro ya avisado. */
export function OrderStatusPill({ order }: { order: Order }) {
  const known = ORDER_STATUS[order.status] ?? { label: order.status, cls: 'bg-gray-100 text-gray-600' };
  const st =
    order.isPickup && order.status === 'FULFILLED' ? { ...known, label: 'Lista para retirar' } : known;
  return <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', st.cls)}>{st.label}</span>;
}

/**
 * El detalle de una venta: lo que compró, los datos del comprador, la
 * facturación y lo que se puede hacer con ella (despachar, generar el envío
 * de un carrier, reembolsar). Lo usan la fila desplegada del listado y la
 * venta que se abre por link aunque no esté en la página.
 */
export function OrderDetail({
  order: o,
  busy,
  canFulfill,
  canRefund,
  canEmit,
  onFulfill,
  onRefund,
  canRegisterPayment = false,
  onRegisterPayment,
  onCancelUnpaid,
}: {
  order: Order;
  busy: boolean;
  canFulfill: boolean;
  canRefund: boolean;
  canEmit: boolean;
  onFulfill: (o: Order) => void;
  onRefund: (o: Order) => void;
  /** Transferencia o efectivo: registrar el pago y cancelar (permiso de cargar ventas). */
  canRegisterPayment?: boolean;
  onRegisterPayment?: (o: Order) => void;
  onCancelUnpaid?: (o: Order) => void;
}) {
  const offline = o.paymentProvider === 'transfer' || o.paymentProvider === 'cash';
  const methodDiscount = o.paymentMethodDiscount?.amount ?? 0;
  const couponDiscount = (o.discount?.amount ?? 0) - methodDiscount;
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold text-fg-muted">Venta {orderLabel(o)}</div>
      {o.items.map((i) => (
        <div key={i.variantId} className="flex justify-between text-xs">
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
        <div className="flex justify-between text-xs text-green-600">
          <span>Descuento{o.couponCode ? ` (${o.couponCode})` : ''}</span>
          <span className="tabular-nums">
            - {money({ amount: couponDiscount, currency: o.discount.currency })}
          </span>
        </div>
      )}
      {o.paymentMethodDiscount && methodDiscount > 0 && (
        <div className="flex justify-between text-xs text-green-600">
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
      {(o.buyerName || o.buyerPhone || o.shippingAddress) && (
        <div className="pt-1 text-xs text-fg-subtle">
          {[o.buyerName, o.buyerPhone, o.docNumber ? `DNI/CUIT ${o.docNumber}` : null]
            .filter(Boolean)
            .join(' · ')}
          {o.shippingAddress && <div>{o.shippingAddress}</div>}
        </div>
      )}
      {o.notes && <div className="text-xs italic text-fg-subtle">Nota: {o.notes}</div>}
      {offline && o.status === 'PENDINGPAYMENT' && (
        <div className="mt-1 rounded-md border border-warning/40 bg-warning-bg px-3 py-2 text-xs text-warning">
          {o.paymentProvider === 'cash' ? 'Paga en efectivo al retirar' : 'Paga por transferencia'}: falta
          registrar el pago
          {o.paymentDueAtUtc ? `. Si no, se cancela sola el ${formatDateTime(o.paymentDueAtUtc)}.` : '.'}
        </div>
      )}
      {offline &&
        o.status === 'PENDINGPAYMENT' &&
        canRegisterPayment &&
        (onRegisterPayment || onCancelUnpaid) && (
          <div className="flex flex-wrap gap-2 pt-2">
            {onRegisterPayment && (
              <button
                type="button"
                onClick={() => onRegisterPayment(o)}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg hover:opacity-90 disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Banknote className="h-3.5 w-3.5" />
                )}{' '}
                Registrar pago
              </button>
            )}
            {onCancelUnpaid && (
              <button
                type="button"
                onClick={() => onCancelUnpaid(o)}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-fg hover:bg-bg-muted disabled:opacity-50"
              >
                <XCircle className="h-3.5 w-3.5" /> Cancelar venta
              </button>
            )}
          </div>
        )}
      {o.paymentId && (
        <div className="pt-1 text-xs text-fg-subtle">
          {o.paymentId.startsWith('manual-')
            ? `Pago registrado a mano (${o.paymentId === 'manual-cash' ? 'efectivo' : o.paymentId === 'manual-transfer' ? 'transferencia' : o.paymentId.slice(7)})`
            : `Pago MP #${o.paymentId}`}
          {o.paidAtUtc ? ` · ${formatDateTime(o.paidAtUtc)}` : ''}
        </div>
      )}
      {o.tracking && (
        <div className="text-xs text-fg-subtle">
          Seguimiento: {o.tracking}
          {o.fulfilledAtUtc ? ` · enviada ${formatDate(o.fulfilledAtUtc)}` : ''}
        </div>
      )}
      {o.refunded && o.refunded.amount > 0 && (
        <div className="text-xs font-medium text-blue-600">
          Reembolsado: {money(o.refunded)}
          {o.refundable && o.refundable.amount > 0 ? ` · queda ${money(o.refundable)}` : ' (total)'}
        </div>
      )}
      {(o.status === 'PAID' ||
        o.status === 'FULFILLED' ||
        o.status === 'REFUNDED' ||
        o.status === 'PARTIALLYREFUNDED') && (
        <FiscalPanel orderId={o.id} orderStatus={o.status} buyerDoc={o.docNumber} canEmit={canEmit} />
      )}
      {(o.status === 'PAID' || o.status === 'FULFILLED' || o.status === 'PARTIALLYREFUNDED') &&
        (canFulfill || canRefund) && (
          <div className="flex flex-wrap gap-2 pt-2">
            {o.status === 'PAID' && canFulfill && (
              <button
                type="button"
                onClick={() => onFulfill(o)}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg hover:opacity-90 disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : o.isPickup ? (
                  <PackageCheck className="h-3.5 w-3.5" />
                ) : (
                  <Truck className="h-3.5 w-3.5" />
                )}{' '}
                {o.isPickup ? 'Lista para retirar' : 'Marcar enviada'}
              </button>
            )}
            {/* Los carriers no aplican a un pedido que se retira en el local. */}
            {o.status === 'PAID' && canFulfill && !o.isPickup && <CorreoShipmentButton order={o} />}
            {(o.status === 'PAID' || o.status === 'FULFILLED') && canFulfill && !o.isPickup && (
              <>
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
                className="inline-flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}{' '}
                Reembolsar
              </button>
            )}
          </div>
        )}
    </div>
  );
}
