import { Fragment, useCallback, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Download, Loader2, Package, Plus, RefreshCw, Search, Truck, X } from 'lucide-react';
import {
  Checkbox,
  clickableRowProps,
  cn,
  Input,
  Select,
  useToast,
  useConfirm,
  usePrompt,
} from '@tiendafy/ui';
import type { MoneyDto as Money } from '@tiendafy/types';
import { api, errMsg } from '../lib/api';
import { useStore } from '../context/StoreContext';
import { usePermissions } from '../context/PermissionsContext';
import { formatDateTime, formatMoney, formatNumber } from '../lib/format';
import { ORDER_STATUS } from '../lib/orderStatus';
import { orderNumber } from '../lib/orderNumber';
import { downloadBlob } from '../lib/download';
import { useListParams, useListSearch } from '../lib/useListParams';
import { HelpLink } from '../components/HelpLink';
import { ManualSaleModal } from './orders-manual';
import { RefundDialog } from './orders-refund';
import { OrderDetail, OrderStatusPill } from './orders-detail';
import { TABLE_CARD, TABLE_HEAD_STICKY, TABLE_SCROLL_X } from '../lib/styles';
import { StatusLegend } from '../components/StatusLegend';
import { Pagination, pageRangeLabel } from '../components/Pagination';
import { ListStats, type ListStat } from '../components/stats/ListStats';
import { TableSkeleton } from '../components/Skeleton';

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
  /** Retiro en el local: "despachar" es tenerlo listo para que lo pasen a buscar. */
  isPickup?: boolean;
  shippingAddress: string | null;
  currency: string;
  /** mercadopago | payway | transfer | cash (los dos últimos se cobran a mano). */
  paymentProvider?: string;
  paymentId: string | null;
  /** Transferencia/efectivo: hasta cuándo se guarda el stock esperando el pago. */
  paymentDueAtUtc?: string | null;
  /** La parte de `discount` que vino de pagar por transferencia o en efectivo. */
  paymentMethodDiscount?: Money | null;
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

/** Ventas por página. */
const PAGE_SIZE = 25;

/** Ventana de las métricas del encabezado, en días. */
const STATS_DAYS = 30;

/** Búsqueda, estado y página del listado: viven en la URL (ver useListParams). */
const LIST_DEFAULTS = { q: '', estado: '', pagina: 1 };

interface SalesStats {
  currency: string;
  revenue: number;
  orders: number;
  averageOrder: number;
}

interface BulkFulfillResult {
  fulfilled: number;
  skipped: number;
  failed: number;
  results: {
    id: string;
    number: string;
    result: 'fulfilled' | 'skipped' | 'failed';
    reason: string | null;
  }[];
}

/** Los parámetros que entiende el listado (y el export, que trae lo mismo). */
function listQuery(q: string, status: string) {
  const params = new URLSearchParams();
  if (q.trim()) params.set('q', q.trim());
  if (status) params.set('status', status);
  return params;
}

export function OrdersPage() {
  const { store } = useStore();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canFulfill = can('orders.fulfill');
  const canRefund = can('orders.refund');
  const canEmit = can('fiscal.emit');
  const canRegisterPayment = can('orders.create');
  const { toast } = useToast();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [manualOpen, setManualOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const list = useListParams(LIST_DEFAULTS);
  const { q, estado: statusFilter, pagina: page } = list.values;
  const [search, setSearch] = useListSearch(list);

  // La búsqueda y el filtro viajan al servidor: con miles de ventas, filtrar
  // solo lo que ya está en pantalla es no encontrar nada. Con React Query, una
  // página ya vista vuelve al instante y al cambiar de página se sigue viendo
  // la anterior hasta que llega la nueva (sin el parpadeo del esqueleto).
  const params = listQuery(q, statusFilter);
  params.set('limit', String(PAGE_SIZE));
  params.set('offset', String((page - 1) * PAGE_SIZE));
  const ordersQuery = useQuery({
    queryKey: ['orders', store?.id, 'list', params.toString()],
    queryFn: () => api.get<{ items: Order[]; total: number }>(`/api/v1/orders?${params}`),
    enabled: !!store,
    placeholderData: keepPreviousData,
  });
  const orders = ordersQuery.data?.items ?? [];
  const total = ordersQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  /** Después de una acción (despachar, reembolsar…): el listado, el contador y la venta abierta por link. */
  const load = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['orders', store?.id] }),
    [queryClient, store?.id],
  );

  // Las métricas miran el período completo, no la página: el listado responde
  // "qué pasó con esta venta" y estos números, "cómo viene el mes". Piden
  // estadísticas (stats.read): quien no lo tiene, no las ve.
  const { data: stats } = useQuery({
    queryKey: ['sales-stats', store?.id, STATS_DAYS],
    queryFn: () => api.get<SalesStats>(`/api/v1/stats/sales?days=${STATS_DAYS}`),
    enabled: !!store && can('stats.read'),
    retry: false,
  });
  // Cobradas y sin despachar: el trabajo pendiente del depósito, de toda la
  // historia. Sale del mismo listado (orders.read), así que la ve todo el que
  // ve las ventas — antes vivía adentro de las métricas y Soporte la perdía.
  const { data: pending } = useQuery({
    queryKey: ['orders', store?.id, 'pending-fulfillment'],
    queryFn: () => api.get<{ total: number }>('/api/v1/orders?status=PAID&limit=1&offset=0'),
    enabled: !!store,
    retry: false,
  });

  const fulfill = useCallback(
    async (o: Order) => {
      // Retiro en el local: no hay seguimiento; se avisa "listo para retirar".
      if (o.isPickup) {
        const ok = await confirm({
          title: 'Listo para retirar',
          message: 'Le avisamos al cliente que su pedido está listo para pasar a buscarlo.',
          confirmLabel: 'Avisar',
        });
        if (!ok) return;
        setBusy(o.id);
        try {
          await api.post(`/api/v1/orders/${o.id}/fulfill`, { tracking: null });
          await load();
        } catch (e) {
          toast(errMsg(e, 'No se pudo marcar como lista para retirar.'), { variant: 'error' });
        } finally {
          setBusy(null);
        }
        return;
      }
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
    [confirm, load, prompt, toast],
  );

  // Transferencia o efectivo: el pago lo registra el comercio cuando ve la
  // plata; cancelar devuelve el stock reservado.
  const registerPayment = useCallback(
    async (o: Order) => {
      const ok = await confirm({
        title: 'Registrar pago',
        message: `¿Ya recibiste ${money(o.total)} de ${o.buyerName || o.buyerEmail}? La venta pasa a pagada, se descuenta el stock y le avisamos al comprador.`,
        confirmLabel: 'Registrar pago',
      });
      if (!ok) return;
      setBusy(o.id);
      try {
        await api.post(`/api/v1/orders/${o.id}/mark-paid`, {});
        toast('Pago registrado', { variant: 'success' });
        await load();
      } catch (e) {
        toast(errMsg(e, 'No se pudo registrar el pago.'), { variant: 'error' });
      } finally {
        setBusy(null);
      }
    },
    [confirm, load, toast],
  );

  const cancelUnpaid = useCallback(
    async (o: Order) => {
      const ok = await confirm({
        title: 'Cancelar venta',
        message:
          'El stock reservado vuelve a estar a la venta. Si el comprador transfiere después, vas a tener que devolverle la plata a mano.',
        confirmLabel: 'Cancelar venta',
        variant: 'danger',
      });
      if (!ok) return;
      setBusy(o.id);
      try {
        await api.post(`/api/v1/orders/${o.id}/cancel`, {});
        toast('Venta cancelada', { variant: 'success' });
        await load();
      } catch (e) {
        toast(errMsg(e, 'No se pudo cancelar la venta.'), { variant: 'error' });
      } finally {
        setBusy(null);
      }
    },
    [confirm, load, toast],
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

  // Deep-link desde Mensajes o Presupuestos: /ventas?order=<id> abre esa venta.
  const [urlParams] = useSearchParams();
  const focusOrder = urlParams.get('order');
  // Al llegar con otro ?order= se expande esa venta (se ajusta al dibujar, no
  // en un efecto que pinta primero la lista sin expandir).
  const [focusedFor, setFocusedFor] = useState<string | null>(null);
  if (focusOrder !== focusedFor) {
    setFocusedFor(focusOrder);
    if (focusOrder) setExpanded(focusOrder);
  }
  // La venta del link puede no estar en esta página (es de hace meses, o hay
  // un filtro puesto): entonces se pide sola y se muestra arriba de la tabla.
  const focusInPage = !!focusOrder && orders.some((o) => o.id === focusOrder);
  const focusQuery = useQuery({
    queryKey: ['orders', store?.id, 'one', focusOrder],
    queryFn: () => api.get<Order>(`/api/v1/orders/${focusOrder}`),
    enabled: !!store && !!focusOrder && ordersQuery.isSuccess && !focusInPage,
    retry: false,
  });
  const focused = !focusInPage ? focusQuery.data : undefined;

  // ---- Selección y acciones en lote
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkFulfillResult | null>(null);
  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selectedOnPage = orders.filter((o) => selected.has(o.id)).length;
  const allPageSelected = orders.length > 0 && selectedOnPage === orders.length;
  const toggleSelectAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const o of orders) {
        if (allPageSelected) next.delete(o.id);
        else next.add(o.id);
      }
      return next;
    });

  const bulkFulfill = async () => {
    const ids = [...selected];
    const ok = await confirm({
      title: `Marcar ${ids.length} ${ids.length === 1 ? 'venta' : 'ventas'} como enviadas`,
      message:
        'Le avisamos a cada comprador (a los que retiran en el local, que su pedido está listo). Va sin código de seguimiento: si hace falta, se carga después en cada venta. Las que no estén cobradas o ya estén enviadas quedan como están.',
      confirmLabel: 'Marcar enviadas',
    });
    if (!ok) return;
    setBulkBusy(true);
    try {
      const res = await api.post<BulkFulfillResult>('/api/v1/orders/bulk/fulfill', { ids });
      setBulkResult(res);
      // Las que salieron (o ya estaban) dejan de estar elegidas; las que
      // fallaron quedan, para reintentarlas o revisarlas.
      const failed = new Set(res.results.filter((r) => r.result === 'failed').map((r) => r.id));
      setSelected((prev) => new Set([...prev].filter((id) => failed.has(id))));
      toast(bulkSummary(res), { variant: res.failed > 0 ? 'error' : 'success' });
      await load();
    } catch (e) {
      toast(errMsg(e, 'No se pudieron marcar las ventas.'), { variant: 'error' });
    } finally {
      setBulkBusy(false);
    }
  };

  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    setExporting(true);
    try {
      const filters = listQuery(q, statusFilter).toString();
      const blob = await api.download(`/api/v1/orders/export${filters ? `?${filters}` : ''}`);
      downloadBlob(blob, `ventas-${store?.subdomain ?? 'tienda'}.csv`);
    } catch (e) {
      toast(errMsg(e, 'No se pudo exportar.'), { variant: 'error' });
    } finally {
      setExporting(false);
    }
  };

  const filtered = list.filtered;
  const firstLoad = ordersQuery.isPending;
  const failedLoad = ordersQuery.isError && !ordersQuery.data;

  const listStats: ListStat[] = [
    ...(stats
      ? [
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
        ]
      : []),
    ...(pending
      ? [
          {
            label: 'Por despachar',
            value: formatNumber(pending.total),
            hint: 'Ventas cobradas que todavía no se marcaron como enviadas. Es la cola del depósito, de toda la historia. Tocá para verlas.',
            tone: pending.total > 0 ? ('warning' as const) : ('success' as const),
            onClick: () => list.set({ estado: statusFilter === 'PAID' ? '' : 'PAID' }),
            active: statusFilter === 'PAID',
          },
        ]
      : []),
  ];

  const rowProps = {
    canFulfill,
    canRefund,
    canEmit,
    onFulfill: fulfill,
    onRefund: setRefunding,
    canRegisterPayment,
    onRegisterPayment: registerPayment,
    onCancelUnpaid: cancelUnpaid,
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-fg">Ventas</h1>
        <div className="flex flex-wrap items-center gap-2">
          {can('orders.create') && (
            <button
              type="button"
              onClick={() => setManualOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
            >
              <Plus className="h-4 w-4" /> Venta manual
            </button>
          )}
          <button
            type="button"
            onClick={exportCsv}
            disabled={exporting || total === 0}
            title="Descarga las ventas de este listado (con la búsqueda y el filtro puestos) en un CSV para Excel."
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-fg hover:bg-bg-muted disabled:opacity-50"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}{' '}
            Exportar
          </button>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-fg hover:bg-bg-muted"
          >
            <RefreshCw className="h-4 w-4" /> Actualizar
          </button>
        </div>
      </div>
      {manualOpen && <ManualSaleModal onClose={() => setManualOpen(false)} onCreated={load} />}

      {listStats.length > 0 && (
        <div className="mb-4">
          <ListStats items={listStats} />
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
          <Input
            type="search"
            aria-label="Buscar ventas"
            className="pl-8"
            placeholder="Buscar por email, nombre o número (#A1B2C3D4)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-52">
          <Select
            aria-label="Filtrar por estado"
            value={statusFilter}
            onChange={(e) => list.set({ estado: e.target.value })}
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

      {focusOrder && !focusInPage && ordersQuery.isSuccess && (
        <FocusedOrder
          order={focused}
          loading={focusQuery.isPending && focusQuery.fetchStatus !== 'idle'}
          busy={!!focused && busy === focused.id}
          {...rowProps}
        />
      )}

      {bulkResult && <BulkResultPanel result={bulkResult} onClose={() => setBulkResult(null)} />}

      {canFulfill && selected.size > 0 && (
        <div className="sticky top-[calc(var(--header-height)+0.5rem)] z-20 mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-surface/95 px-4 py-2.5 shadow-card backdrop-blur-xl">
          <span className="text-sm font-semibold text-primary">
            {selected.size} {selected.size === 1 ? 'seleccionada' : 'seleccionadas'}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={bulkBusy}
              onClick={bulkFulfill}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-50"
            >
              {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />} Marcar
              como enviadas
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-fg-muted hover:text-fg"
            >
              <X className="h-4 w-4" /> Deseleccionar
            </button>
          </div>
        </div>
      )}

      {firstLoad ? (
        <div className="rounded-lg border border-border bg-surface">
          <TableSkeleton rows={8} label="Cargando ventas…" />
        </div>
      ) : failedLoad ? (
        <div
          role="alert"
          className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-danger/40 py-16 text-center text-fg-muted"
        >
          <AlertTriangle className="h-8 w-8 text-danger" />
          <p className="text-fg">No se pudieron cargar las ventas.</p>
          <p className="text-xs">{errMsg(ordersQuery.error, 'Revisá la conexión y probá de nuevo.')}</p>
          <button
            type="button"
            onClick={() => ordersQuery.refetch()}
            className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-fg hover:bg-bg-muted"
          >
            <RefreshCw className="h-4 w-4" /> Reintentar
          </button>
        </div>
      ) : orders.length === 0 ? (
        filtered ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-16 text-center text-fg-muted">
            <Search className="h-8 w-8 opacity-50" />
            <p>Ninguna venta coincide con la búsqueda o el filtro.</p>
            <button
              type="button"
              onClick={list.reset}
              className="text-sm font-medium text-primary hover:underline"
            >
              Limpiar búsqueda y filtros
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-16 text-center text-fg-muted">
            <Package className="h-8 w-8 opacity-50" />
            <p>Todavía no hay ventas.</p>
            <p className="text-xs">Cuando un cliente pague con Mercado Pago, la orden aparece acá.</p>
          </div>
        )
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
          <div className={cn(TABLE_CARD, ordersQuery.isPlaceholderData && 'opacity-60 transition-opacity')}>
            <div className={TABLE_SCROLL_X}>
              <table className="w-full text-sm" aria-busy={ordersQuery.isPlaceholderData || undefined}>
                <thead className={TABLE_HEAD_STICKY}>
                  <tr className="border-b border-border text-left text-xs text-fg-muted">
                    {canFulfill && (
                      <th className="w-10 px-3 py-2.5">
                        <Checkbox
                          checked={allPageSelected}
                          indeterminate={selectedOnPage > 0 && !allPageSelected}
                          onChange={toggleSelectAll}
                          aria-label="Seleccionar todas las ventas de la página"
                        />
                      </th>
                    )}
                    <th className="px-4 py-2.5 font-medium">Número</th>
                    <th className="px-4 py-2.5 font-medium">Fecha</th>
                    <th className="px-4 py-2.5 font-medium">Cliente</th>
                    <th className="px-4 py-2.5 text-right font-medium">Total</th>
                    <th className="px-4 py-2.5 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <OrderRow
                      key={o.id}
                      order={o}
                      open={expanded === o.id}
                      onToggle={() => setExpanded(expanded === o.id ? null : o.id)}
                      selectable={canFulfill}
                      selected={selected.has(o.id)}
                      onSelect={() => toggleSelect(o.id)}
                      busy={busy === o.id}
                      {...rowProps}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!firstLoad && !failedLoad && (
        <Pagination
          page={Math.min(page, totalPages)}
          totalPages={totalPages}
          onPage={(p) => list.set({ pagina: p })}
        />
      )}

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

interface RowActions {
  canFulfill: boolean;
  canRefund: boolean;
  canEmit: boolean;
  onFulfill: (o: Order) => void;
  onRefund: (o: Order) => void;
  canRegisterPayment?: boolean;
  onRegisterPayment?: (o: Order) => void;
  onCancelUnpaid?: (o: Order) => void;
}

/**
 * Una venta del listado y, desplegado, su detalle. El número es un botón: con
 * el teclado se llega a él con Tab y se abre con Enter; con el mouse alcanza
 * con tocar cualquier parte de la fila.
 */
function OrderRow({
  order: o,
  open,
  onToggle,
  selectable,
  selected,
  onSelect,
  busy,
  ...actions
}: {
  order: Order;
  open: boolean;
  onToggle: () => void;
  selectable: boolean;
  selected: boolean;
  onSelect: () => void;
  busy: boolean;
} & RowActions) {
  const detailId = `venta-${o.id}`;
  const row = clickableRowProps(onToggle, { focusable: false });
  const columns = selectable ? 6 : 5;
  return (
    <Fragment>
      <tr
        {...row}
        className={cn(
          'border-b border-border last:border-b-0 hover:bg-bg-muted',
          row.className,
          selected && 'bg-primary/5',
        )}
      >
        {selectable && (
          <td className="w-10 px-3 py-3">
            <Checkbox
              checked={selected}
              onChange={onSelect}
              aria-label={`Seleccionar la venta ${orderNumber(o.id)}`}
            />
          </td>
        )}
        <td className="whitespace-nowrap px-4 py-3">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={open ? detailId : undefined}
            aria-label={`Venta ${orderNumber(o.id)}: ${open ? 'ocultar' : 'ver'} detalle`}
            className="rounded font-mono text-xs font-semibold text-fg hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {orderNumber(o.id)}
          </button>
        </td>
        <td className="px-4 py-3 text-fg-muted">{formatDateTime(o.createdAtUtc)}</td>
        <td className="px-4 py-3 text-fg">{o.buyerEmail}</td>
        <td className="px-4 py-3 text-right font-semibold tabular-nums text-fg">{money(o.total)}</td>
        <td className="px-4 py-3">
          <OrderStatusPill order={o} />
        </td>
      </tr>
      {open && (
        <tr id={detailId} className="border-b border-border bg-bg-muted/40">
          <td colSpan={columns} className="px-4 py-3">
            <OrderDetail order={o} busy={busy} {...actions} />
          </td>
        </tr>
      )}
    </Fragment>
  );
}

/** La venta que pidió un link (?order=) cuando no está en la página que se ve. */
function FocusedOrder({
  order,
  loading,
  busy,
  ...actions
}: { order: Order | undefined; loading: boolean; busy: boolean } & RowActions) {
  if (loading) {
    return (
      <div className="mb-4 rounded-lg border border-border bg-surface">
        <TableSkeleton rows={1} label="Buscando la venta…" />
      </div>
    );
  }
  if (!order) {
    return (
      <p role="status" className="mb-4 rounded-lg bg-warning-bg px-3 py-2 text-sm text-warning">
        No encontramos la venta del link: puede que no exista o que sea de otra tienda.
      </p>
    );
  }
  return (
    <section
      aria-label={`Venta ${orderNumber(order.id)}`}
      className="mb-4 rounded-lg border border-primary/40 bg-surface p-4"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-mono font-semibold text-fg">{orderNumber(order.id)}</span>
        <span className="text-fg-muted">
          {formatDateTime(order.createdAtUtc)} · {order.buyerEmail} · {money(order.total)}
        </span>
        <OrderStatusPill order={order} />
        <span className="text-xs text-fg-subtle">(no está en esta página del listado)</span>
      </div>
      <OrderDetail order={order} busy={busy} {...actions} />
    </section>
  );
}

/** "3 marcadas como enviadas · 1 ya estaba · 2 no se pudieron" */
function bulkSummary(r: BulkFulfillResult): string {
  const parts = [
    `${r.fulfilled} ${r.fulfilled === 1 ? 'marcada' : 'marcadas'} como ${r.fulfilled === 1 ? 'enviada' : 'enviadas'}`,
  ];
  if (r.skipped > 0) parts.push(`${r.skipped} ya ${r.skipped === 1 ? 'estaba enviada' : 'estaban enviadas'}`);
  if (r.failed > 0) parts.push(`${r.failed} no se ${r.failed === 1 ? 'pudo' : 'pudieron'} marcar`);
  return parts.join(' · ');
}

/** Lo que pasó con el lote, con el motivo de cada una que no salió. */
function BulkResultPanel({ result, onClose }: { result: BulkFulfillResult; onClose: () => void }) {
  const failed = result.results.filter((r) => r.result === 'failed');
  return (
    <div
      role="status"
      className={cn(
        'mb-3 rounded-lg border px-4 py-3 text-sm',
        failed.length > 0 ? 'border-warning/40 bg-warning-bg' : 'border-success/40 bg-success/5',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium text-fg">{bulkSummary(result)}.</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar el resumen"
          className="rounded p-0.5 text-fg-muted hover:text-fg"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {failed.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-fg-muted">
          {failed.map((r) => (
            <li key={r.id}>
              <span className="font-mono font-semibold text-fg">{r.number}</span>: {r.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
