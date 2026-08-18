import { Fragment, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, RefreshCw, Package, Truck, Undo2 } from 'lucide-react';
import { cn, Input, useToast, useConfirm, usePrompt } from '@tiendafy/ui';
import type { MoneyDto as Money } from '@tiendafy/types';
import { api, errMsg } from '../lib/api';
import { useStore } from '../context/StoreContext';
import { usePermissions } from '../context/PermissionsContext';
import { formatDate, formatDateTime, formatMoney } from '../lib/format';
import { ORDER_STATUS } from '../lib/orderStatus';
import { HelpLink } from '../components/HelpLink';
import { CorreoShipmentButton } from '../components/CorreoShipment';
import { ZipnovaShipmentButton } from '../components/ZipnovaShipment';
import { FiscalPanel } from './orders-fiscal';
import { RefundDialog } from './orders-refund';
import { TABLE_CARD } from '../lib/styles';

interface OrderItem {
  variantId: string;
  productName: string;
  variantDescription: string;
  sku: string;
  quantity: number;
  unitPrice: Money;
}
export interface Order {
  id: string;
  status: string;
  buyerEmail: string;
  buyerName: string | null;
  buyerPhone: string | null;
  docNumber: string | null;
  notes: string | null;
  shipping: Money | null;
  shippingMethod: string | null;
  shippingAddress: string | null;
  currency: string;
  paymentId: string | null;
  couponCode: string | null;
  createdAtUtc: string;
  paidAtUtc: string | null;
  tracking: string | null;
  fulfilledAtUtc: string | null;
  subtotal: Money;
  discount: Money;
  total: Money;
  refunded: Money;
  refundable: Money;
  items: OrderItem[];
}

export interface RefundRecord {
  id: string;
  amount: Money;
  isTotal: boolean;
  reason: string | null;
  requestedBy: string;
  mpRefundId: string | null;
  createdAtUtc: string;
}

export const money = (m: Money) => formatMoney(m.amount, m.currency);

export function OrdersPage() {
  const { store } = useStore();
  const { can } = usePermissions();
  const canFulfill = can('orders.fulfill');
  const canRefund = can('orders.refund');
  const canEmit = can('fiscal.emit');
  const { toast } = useToast();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ items: Order[] }>('/api/v1/orders?limit=50');
      setOrders(data.items ?? []);
      setHasMore((data.items ?? []).length === 50);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Paginado por cursor: trae las 50 siguientes a la última cargada.
  const loadMore = useCallback(async () => {
    const last = orders[orders.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const data = await api.get<{ items: Order[] }>(`/api/v1/orders?limit=50&after=${last.id}`);
      const next = data.items ?? [];
      setOrders((prev) => [...prev, ...next]);
      setHasMore(next.length === 50);
    } catch (e) {
      toast(errMsg(e, 'No se pudieron cargar más ventas.'), { variant: 'error' });
    } finally {
      setLoadingMore(false);
    }
  }, [orders, toast]);

  const fulfill = useCallback(
    async (o: Order) => {
      const tracking = await prompt({
        title: 'Marcar como enviada',
        message: 'Código de seguimiento (opcional):',
        defaultValue: o.tracking ?? '',
        placeholder: 'Ej: AR123456789',
        confirmLabel: 'Marcar enviada',
      });
      if (tracking === null) return; // canceló
      setBusy(o.id);
      try {
        await api.post(`/api/v1/orders/${o.id}/fulfill`, { tracking: tracking.trim() || null });
        await load();
      } catch (e) {
        toast(errMsg(e, 'No se pudo marcar como enviada.'), { variant: 'error' });
      } finally {
        setBusy(null);
      }
    },
    [load, prompt, toast],
  );

  const [refunding, setRefunding] = useState<Order | null>(null);

  const doRefund = useCallback(
    async (o: Order, amount: number | null, reason: string) => {
      const label = amount === null ? money(o.refundable ?? o.total) : formatMoney(amount, o.currency);
      if (
        !(await confirm({
          title: 'Confirmar reembolso',
          message: `¿Reembolsar ${label} a ${o.buyerEmail}? Esto devuelve el dinero en Mercado Pago y no se puede deshacer.`,
          confirmLabel: 'Reembolsar',
          variant: 'danger',
        }))
      )
        return false;
      setBusy(o.id);
      try {
        await api.post(`/api/v1/orders/${o.id}/refund`, { amount, reason: reason.trim() || null });
        toast('Reembolso realizado', { variant: 'success' });
        await load();
        return true;
      } catch (e) {
        toast(errMsg(e, 'No se pudo reembolsar.'), { variant: 'error' });
        return false;
      } finally {
        setBusy(null);
      }
    },
    [load, confirm, toast],
  );

  useEffect(() => {
    if (store) load();
  }, [store, load]);

  // Deep-link desde Mensajes (arrepentimiento): /ventas?order=<id> expande esa venta.
  const [params] = useSearchParams();
  const focusOrder = params.get('order');
  useEffect(() => {
    if (focusOrder) setExpanded(focusOrder);
  }, [focusOrder]);
  const focusMissing = !loading && !!focusOrder && !orders.some((o) => o.id === focusOrder);

  return (
    <div className="mx-auto max-w-5xl px-6 py-6">
      {focusMissing && (
        <p className="mb-4 rounded-lg bg-warning-bg px-3 py-2 text-sm text-warning">
          La venta buscada no está entre las últimas 50 — usá “Actualizar” o buscala por el email del cliente.
        </p>
      )}
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-fg">Ventas</h1>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-fg hover:bg-bg-muted"
        >
          <RefreshCw className="h-4 w-4" /> Actualizar
        </button>
      </div>

      <Input
        placeholder="Buscar por email, nombre o número de orden…"
        className="mb-3"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading ? (
        <div className="flex items-center gap-2 py-16 text-sm text-fg-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando ventas…
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-16 text-center text-fg-muted">
          <Package className="h-8 w-8 opacity-50" />
          <p>Todavía no hay ventas.</p>
          <p className="text-xs">Cuando un cliente pague con Mercado Pago, la orden aparece acá.</p>
        </div>
      ) : (
        <div className={TABLE_CARD}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-fg-muted">
                <th className="px-4 py-2.5 font-medium">Fecha</th>
                <th className="px-4 py-2.5 font-medium">Cliente</th>
                <th className="px-4 py-2.5 text-right font-medium">Total</th>
                <th className="px-4 py-2.5 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {orders
                .filter((o) => {
                  const q = search.trim().toLowerCase();
                  if (q === '') return true;
                  return (
                    o.buyerEmail.toLowerCase().includes(q) ||
                    (o.buyerName ?? '').toLowerCase().includes(q) ||
                    o.id.toLowerCase().startsWith(q)
                  );
                })
                .map((o) => {
                  const st = ORDER_STATUS[o.status] ?? { label: o.status, cls: 'bg-gray-100 text-gray-600' };
                  const open = expanded === o.id;
                  return (
                    <Fragment key={o.id}>
                      <tr
                        onClick={() => setExpanded(open ? null : o.id)}
                        className="cursor-pointer border-b border-border last:border-b-0 hover:bg-bg-muted"
                      >
                        <td className="px-4 py-3 text-fg-muted">{formatDateTime(o.createdAtUtc)}</td>
                        <td className="px-4 py-3 text-fg">{o.buyerEmail}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-fg">
                          {money(o.total)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', st.cls)}>
                            {st.label}
                          </span>
                        </td>
                      </tr>
                      {open && (
                        <tr className="border-b border-border bg-bg-muted/40">
                          <td colSpan={4} className="px-4 py-3">
                            <div className="space-y-1.5">
                              {o.items.map((i) => (
                                <div key={i.variantId} className="flex justify-between text-xs">
                                  <span className="text-fg">
                                    {i.quantity}× {i.productName}
                                    {i.variantDescription ? ` · ${i.variantDescription}` : ''}
                                  </span>
                                  <span className="tabular-nums text-fg-muted">
                                    {money({
                                      amount: i.unitPrice.amount * i.quantity,
                                      currency: i.unitPrice.currency,
                                    })}
                                  </span>
                                </div>
                              ))}
                              {o.discount && o.discount.amount > 0 && (
                                <div className="flex justify-between text-xs text-green-600">
                                  <span>Descuento{o.couponCode ? ` (${o.couponCode})` : ''}</span>
                                  <span className="tabular-nums">- {money(o.discount)}</span>
                                </div>
                              )}
                              {o.shipping && o.shipping.amount > 0 && (
                                <div className="flex justify-between text-xs">
                                  <span className="text-fg">
                                    Envío{o.shippingMethod ? ` · ${o.shippingMethod}` : ''}
                                  </span>
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
                              {o.notes && (
                                <div className="text-xs italic text-fg-subtle">Nota: {o.notes}</div>
                              )}
                              {o.paymentId && (
                                <div className="pt-1 text-xs text-fg-subtle">
                                  Pago MP #{o.paymentId}
                                  {o.paidAtUtc ? ` · ${new Date(o.paidAtUtc).toLocaleString('es-AR')}` : ''}
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
                                  {o.refundable && o.refundable.amount > 0
                                    ? ` · queda ${money(o.refundable)}`
                                    : ' (total)'}
                                </div>
                              )}
                              {open &&
                                (o.status === 'PAID' ||
                                  o.status === 'FULFILLED' ||
                                  o.status === 'REFUNDED' ||
                                  o.status === 'PARTIALLYREFUNDED') && (
                                  <div onClick={(e) => e.stopPropagation()}>
                                    <FiscalPanel orderId={o.id} orderStatus={o.status} canEmit={canEmit} />
                                  </div>
                                )}
                              {(o.status === 'PAID' ||
                                o.status === 'FULFILLED' ||
                                o.status === 'PARTIALLYREFUNDED') &&
                                (canFulfill || canRefund) && (
                                  <div
                                    className="flex flex-wrap gap-2 pt-2"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {o.status === 'PAID' && canFulfill && (
                                      <button
                                        onClick={() => fulfill(o)}
                                        disabled={busy === o.id}
                                        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg hover:opacity-90 disabled:opacity-50"
                                      >
                                        {busy === o.id ? (
                                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                          <Truck className="h-3.5 w-3.5" />
                                        )}{' '}
                                        Marcar enviada
                                      </button>
                                    )}
                                    {o.status === 'PAID' && canFulfill && <CorreoShipmentButton order={o} />}
                                    {(o.status === 'PAID' || o.status === 'FULFILLED') && canFulfill && (
                                      <ZipnovaShipmentButton order={o} />
                                    )}
                                    {o.status === 'FULFILLED' && canFulfill && (
                                      <button
                                        onClick={() => fulfill(o)}
                                        disabled={busy === o.id}
                                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-fg hover:bg-bg-muted disabled:opacity-50"
                                      >
                                        <Truck className="h-3.5 w-3.5" /> Editar seguimiento
                                      </button>
                                    )}
                                    {o.paymentId && canRefund && (
                                      <button
                                        onClick={() => setRefunding(o)}
                                        disabled={busy === o.id}
                                        className="inline-flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                                      >
                                        {busy === o.id ? (
                                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                          <Undo2 className="h-3.5 w-3.5" />
                                        )}{' '}
                                        Reembolsar
                                      </button>
                                    )}
                                  </div>
                                )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && hasMore && search.trim() === '' && (
        <div className="mt-3 text-center">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-1.5 text-sm font-medium text-fg hover:bg-bg-muted disabled:opacity-50"
          >
            {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />} Cargar 50 más
          </button>
        </div>
      )}

      {refunding && (
        <RefundDialog
          order={refunding}
          busy={busy === refunding.id}
          onClose={() => setRefunding(null)}
          onSubmit={async (amount, reason) => {
            const ok = await doRefund(refunding, amount, reason);
            if (ok) setRefunding(null);
          }}
        />
      )}
      <HelpLink id="ventas" />
    </div>
  );
}
