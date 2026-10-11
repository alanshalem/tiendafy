import { Fragment, useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Plus, RefreshCw, Package, Truck, Undo2 } from 'lucide-react';
import { cn, Input, Select, useToast, useConfirm, usePrompt } from '@tiendafy/ui';
import type { MoneyDto as Money } from '@tiendafy/types';
import { api, errMsg } from '../lib/api';
import { useStore } from '../context/StoreContext';
import { usePermissions } from '../context/PermissionsContext';
import { formatDate, formatDateTime, formatMoney, formatNumber } from '../lib/format';
import { ORDER_STATUS } from '../lib/orderStatus';
import { HelpLink } from '../components/HelpLink';
import { CorreoShipmentButton } from '../components/CorreoShipment';
import { ManualSaleModal } from './orders-manual';
import { ZipnovaShipmentButton } from '../components/ZipnovaShipment';
import { AndreaniShipmentButton } from '../components/AndreaniShipment';
import { FiscalPanel } from './orders-fiscal';
import { RefundDialog } from './orders-refund';
import { TABLE_CARD, TABLE_HEAD_STICKY } from '../lib/styles';
import { StatusLegend } from '../components/StatusLegend';
import { Pagination, pageRangeLabel } from '../components/Pagination';
import { useDebouncedValue } from '../lib/useDebouncedValue';
import { ListStats } from '../components/stats/ListStats';

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

/** Ventas por página. 50 entra cómodo en una pantalla con scroll corto. */
const PAGE_SIZE = 25;

/** Ventana de las métricas del encabezado, en días. */
const STATS_DAYS = 30;

interface SalesStats {
  currency: string;
  revenue: number;
  orders: number;
  averageOrder: number;
}

export function OrdersPage() {
  const { store } = useStore();
  const { can } = usePermissions();
  const canFulfill = can('orders.fulfill');
  const canRefund = can('orders.refund');
  const canEmit = can('fiscal.emit');
  const { toast } = useToast();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [manualOpen, setManualOpen] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const debouncedSearch = useDebouncedValue(search, 350);

  // La búsqueda y el filtro viajan al servidor: con miles de ventas, filtrar
  // solo lo que ya está en pantalla es no encontrar nada.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
      });
      if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim());
      if (statusFilter) params.set('status', statusFilter);

      const data = await api.get<{ items: Order[]; total: number }>(`/api/v1/orders?${params}`);
      setOrders(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setOrders([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Las métricas miran el período completo, no la página: el listado responde
  // "qué pasó con esta venta" y estos números, "cómo viene el mes".
  const { data: stats } = useQuery({
    queryKey: ['sales-stats', store?.id, STATS_DAYS],
    queryFn: () => api.get<SalesStats>(`/api/v1/stats/sales?days=${STATS_DAYS}`),
    enabled: !!store,
    retry: false,
  });
  // Cobradas y sin despachar: el trabajo pendiente del depósito, de toda la
  // historia — no solo del período de las métricas.
  const { data: pending } = useQuery({
    queryKey: ['orders-pending-fulfillment', store?.id],
    queryFn: () => api.get<{ total: number }>('/api/v1/orders?status=PAID&limit=1'),
    enabled: !!store,
    retry: false,
  });

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
    async (o: Order, amount: number | null, reason: string, restock: boolean) => {
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
        await api.post(`/api/v1/orders/${o.id}/refund`, { amount, reason: reason.trim() || null, restock });
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
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-fg">Ventas</h1>
        <div className="flex items-center gap-2">
          {can('orders.fulfill') && (
            <button
              onClick={() => setManualOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
            >
              <Plus className="h-4 w-4" /> Venta manual
            </button>
          )}
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-fg hover:bg-bg-muted"
          >
            <RefreshCw className="h-4 w-4" /> Actualizar
          </button>
        </div>
      </div>
      {manualOpen && <ManualSaleModal onClose={() => setManualOpen(false)} onCreated={load} />}

      {stats && (
        <div className="mb-4">
          <ListStats
            items={[
              {
                label: `Facturado (${STATS_DAYS} d)`,
                value: formatMoney(stats.revenue, stats.currency),
                hint: 'Suma de las ventas cobradas del período. No descuenta reembolsos ni comisiones.',
              },
              {
                label: 'Ventas cobradas',
                value: formatNumber(stats.orders),
                hint: `Ventas con el pago acreditado en los últimos ${STATS_DAYS} días.`,
              },
              {
                label: 'Ticket promedio',
                value: formatMoney(stats.averageOrder, stats.currency),
                hint: 'Facturado dividido por la cantidad de ventas cobradas.',
              },
              {
                label: 'Por despachar',
                value: formatNumber(pending?.total ?? 0),
                hint: 'Ventas cobradas que todavía no se marcaron como enviadas. Es la cola del depósito, de toda la historia. Tocá para verlas.',
                tone: (pending?.total ?? 0) > 0 ? 'warning' : 'success',
                onClick: () => {
                  setStatusFilter((current) => (current === 'PAID' ? '' : 'PAID'));
                  setPage(1);
                },
                active: statusFilter === 'PAID',
              },
            ]}
          />
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="min-w-[16rem] flex-1">
          <Input
            placeholder="Buscar por email, nombre o número de orden…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="w-52">
          <Select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            options={[
              { value: '', label: 'Todos los estados' },
              ...Object.entries(ORDER_STATUS).map(([value, meta]) => ({ value, label: meta.label })),
            ]}
          />
        </div>
        {total > 0 && (
          <span className="text-xs text-fg-subtle">
            {pageRangeLabel(page, PAGE_SIZE, total, total === 1 ? 'venta' : 'ventas')}
          </span>
        )}
      </div>

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
        <>
          <StatusLegend
            items={[
              { dot: 'bg-amber-400', text: 'Pendiente: esperando el pago' },
              { dot: 'bg-green-500', text: 'Pagada / Entregada: cobrada' },
              { dot: 'bg-blue-400', text: 'Reembolsada' },
              { dot: 'bg-red-400', text: 'Fallida / Contracargo' },
              { dot: 'bg-gray-400', text: 'Cancelada' },
            ]}
          />
          <div className={TABLE_CARD}>
            <table className="w-full text-sm">
              <thead className={TABLE_HEAD_STICKY}>
                <tr className="border-b border-border text-left text-xs text-fg-muted">
                  <th className="px-4 py-2.5 font-medium">Fecha</th>
                  <th className="px-4 py-2.5 font-medium">Cliente</th>
                  <th className="px-4 py-2.5 text-right font-medium">Total</th>
                  <th className="px-4 py-2.5 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const st = ORDER_STATUS[o.status] ?? {
                    label: o.status,
                    cls: 'bg-gray-100 text-gray-600',
                  };
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
                              {(o.status === 'PAID' ||
                                o.status === 'FULFILLED' ||
                                o.status === 'REFUNDED' ||
                                o.status === 'PARTIALLYREFUNDED') && (
                                <div onClick={(e) => e.stopPropagation()}>
                                  <FiscalPanel
                                    orderId={o.id}
                                    orderStatus={o.status}
                                    buyerDoc={o.docNumber}
                                    canEmit={canEmit}
                                  />
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
                                      <>
                                        <ZipnovaShipmentButton order={o} />
                                        <AndreaniShipmentButton order={o} />
                                      </>
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
        </>
      )}

      {!loading && <Pagination page={page} totalPages={totalPages} onPage={setPage} />}

      {refunding && (
        <RefundDialog
          order={refunding}
          busy={busy === refunding.id}
          onClose={() => setRefunding(null)}
          onSubmit={async (amount, reason, restock) => {
            const ok = await doRefund(refunding, amount, reason, restock);
            if (ok) setRefunding(null);
          }}
        />
      )}
      <HelpLink id="ventas" />
    </div>
  );
}
