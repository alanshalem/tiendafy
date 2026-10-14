import { Fragment, useCallback, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, Package, Plus, RefreshCw, Search, Store } from 'lucide-react';
import {
  Checkbox,
  clickableRowProps,
  cn,
  Input,
  Select,
  useToast,
  useConfirm,
  usePrompt,
  Spinner,
  EmptyList,
} from '@tiendafy/ui';
import type { MoneyDto as Money } from '@tiendafy/types';
import { api, errMsg } from '../lib/api';
import { useStore } from '../context/StoreContext';
import { usePermissions } from '../context/PermissionsContext';
import { formatDate, formatDateTime, formatMoney, formatNumber } from '../lib/format';
import { ORDER_STATUS } from '../lib/orderStatus';
import { ORDER_CHANNEL, ORDER_PAYMENT, ORDER_SHIPPING, refundEffect, toOptions } from '../lib/orderFacets';
import { orderLabel } from '../lib/orderNumber';
import { downloadBlob } from '../lib/download';
import { useListParams, useListSearch } from '../lib/useListParams';
import { useIsNarrow } from '../lib/useMediaQuery';
import { HelpLink } from '../components/HelpLink';
import { ManualSaleModal } from './orders-manual';
import { RefundDialog } from './orders-refund';
import { OrderDetail, OrderStatusPill, ShippingPill, type OrderActions } from './orders-detail';
import { BulkReportPanel, OrdersBulkBar, type BulkReport } from './orders-bulk';
import { TABLE_CARD, TABLE_HEAD_STICKY, TABLE_SCROLL_X } from '../lib/styles';
import { StatusLegend } from '../components/StatusLegend';
import { Pagination, pageRangeLabel } from '../components/Pagination';
import { ListStats, type ListStat } from '../components/stats/ListStats';
import { TableSkeleton } from '../components/Skeleton';
import { LoadError } from '../components/LoadError';

interface OrderItem {
  variantId: string;
  productName: string;
  variantDescription: string;
  sku: string;
  quantity: number;
  unitPrice: Money;
}
export interface Order {
  /** Número de la tienda (#1042). */
  number?: number;
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
  paymentId: string | null;
  preferenceId?: string | null;
  /** mercadopago | payway | transfer | cash (los dos últimos se cobran a mano). */
  paymentProvider?: string;
  /** Transferencia/efectivo: hasta cuándo se guarda el stock esperando el pago. */
  paymentDueAtUtc?: string | null;
  /** La parte de `discount` que vino de pagar por transferencia o en efectivo. */
  paymentMethodDiscount?: Money | null;
  couponCode: string | null;
  createdAtUtc: string;
  paidAtUtc: string | null;
  tracking: string | null;
  fulfilledAtUtc: string | null;
  /** web | manual | quote (lib/orderFacets). */
  channel?: string;
  /** online | cash | transfer | cuenta_corriente; null = sin cobrar. */
  paymentMethod?: string | null;
  /** por-despachar | por-preparar | enviada | lista-para-retirar; null = no aplica. */
  shippingStatus?: string | null;
  cancelledAtUtc?: string | null;
  cancelledBy?: string | null;
  cancelReason?: string | null;
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

/**
 * Búsqueda, filtros y página del listado: viven en la URL (ver
 * useListParams), así el Inicio puede mandar a "las que hay que despachar" o
 * "las transferencias por confirmar" con un link.
 */
const LIST_DEFAULTS = { q: '', estado: '', desde: '', hasta: '', canal: '', envio: '', cobro: '', pagina: 1 };
type ListValues = typeof LIST_DEFAULTS;

interface SalesStats {
  currency: string;
  revenue: number;
  orders: number;
  averageOrder: number;
}

/** Los parámetros que entiende el listado (y el export, que trae lo mismo). */
function listQuery(v: ListValues) {
  const params = new URLSearchParams();
  if (v.q.trim()) params.set('q', v.q.trim());
  if (v.estado) params.set('status', v.estado);
  if (v.desde) params.set('from', v.desde);
  if (v.hasta) params.set('to', v.hasta);
  if (v.canal) params.set('channel', v.canal);
  if (v.envio) params.set('shipping', v.envio);
  if (v.cobro) params.set('payment', v.cobro);
  return params;
}

export function OrdersPage() {
  const { store } = useStore();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canFulfill = can('orders.fulfill');
  const canRefund = can('orders.refund');
  const canEmit = can('fiscal.emit');
  const canCancel = can('orders.create') || canRefund;
  const { toast } = useToast();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const narrow = useIsNarrow();
  const [manualOpen, setManualOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const list = useListParams(LIST_DEFAULTS);
  const { estado: statusFilter, pagina: page } = list.values;
  const [search, setSearch] = useListSearch(list);

  // La búsqueda y los filtros viajan al servidor: con miles de ventas,
  // filtrar solo lo que ya está en pantalla es no encontrar nada. Con React
  // Query, una página ya vista vuelve al instante y al cambiar de página se
  // sigue viendo la anterior hasta que llega la nueva (sin el parpadeo del
  // esqueleto).
  const params = listQuery(list.values);
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

  const [refunding, setRefunding] = useState<Order | null>(null);

  const doRefund = useCallback(
    async (o: Order, amount: number | null, reason: string, restock: boolean) => {
      const label = amount === null ? money(o.refundable ?? o.total) : formatMoney(amount, o.currency);
      if (
        !(await confirm({
          title: 'Confirmar reembolso',
          message: `¿Reembolsar ${label} a ${o.buyerEmail}? ${refundEffect(o.paymentMethod, o.paymentId)} No se puede deshacer.`,
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

  // Una venta que nunca se cobró (el link de pago que no se pagó): se cancela
  // para liberar el stock y anular el link. El motivo queda en la venta.
  const cancel = useCallback(
    async (o: Order) => {
      const reason = await prompt({
        title: `Cancelar la venta ${orderLabel(o)}`,
        message:
          'Se anula el link de pago (si tiene), se libera el stock reservado y la venta queda cancelada. No se puede deshacer. Motivo (opcional):',
        placeholder: 'Ej: no pagó, se arrepintió',
        confirmLabel: 'Cancelar venta',
      });
      if (reason === null) return;
      setBusy(o.id);
      try {
        const r = await api.post<{ linkExpired: boolean }>(`/api/v1/orders/${o.id}/cancel`, {
          reason: reason.trim() || null,
        });
        toast(
          o.preferenceId && !r.linkExpired
            ? 'Venta cancelada y stock liberado. No pudimos anular el link en Mercado Pago: si el cliente paga igual, la venta queda cancelada y vas a tener que devolverle la plata desde Mercado Pago.'
            : 'Venta cancelada: stock liberado y link de pago anulado.',
          { variant: o.preferenceId && !r.linkExpired ? 'error' : 'success' },
        );
        await load();
      } catch (e) {
        toast(errMsg(e, 'No se pudo cancelar la venta.'), { variant: 'error' });
      } finally {
        setBusy(null);
      }
    },
    [load, prompt, toast],
  );

  // Transferencia o efectivo del checkout: el pago lo registra el comercio
  // cuando ve la plata (stock, email al comprador, factura y cupón).
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
  // Se guardan las ventas (no solo los ids): los remitos y la facturación en
  // lote necesitan sus datos aunque la selección cruce páginas.
  const [selected, setSelected] = useState<Map<string, Order>>(new Map());
  const [bulkReport, setBulkReport] = useState<BulkReport | null>(null);
  const toggleSelect = (o: Order) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(o.id)) next.delete(o.id);
      else next.set(o.id, o);
      return next;
    });
  const selectedOnPage = orders.filter((o) => selected.has(o.id)).length;
  const allPageSelected = orders.length > 0 && selectedOnPage === orders.length;
  const toggleSelectAll = () =>
    setSelected((prev) => {
      const next = new Map(prev);
      for (const o of orders) {
        if (allPageSelected) next.delete(o.id);
        else next.set(o.id, o);
      }
      return next;
    });

  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    setExporting(true);
    try {
      const filters = listQuery(list.values).toString();
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

  const actions: OrderActions = {
    canFulfill,
    canRefund,
    canEmit,
    canCancel,
    onFulfill: fulfill,
    onRefund: setRefunding,
    onCancel: cancel,
    canRegisterPayment: can('orders.create'),
    onRegisterPayment: registerPayment,
  };

  return (
    // Lugar para la barra de lo elegido, que en el celular va fija abajo.
    <div className={cn(selected.size > 0 && 'pb-44 sm:pb-0')}>
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
            title="Descarga las ventas de este listado (con la búsqueda y los filtros puestos) en un CSV para Excel."
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-fg hover:bg-bg-muted disabled:opacity-50"
          >
            {exporting ? <Spinner inline /> : <Download className="h-4 w-4" />} Exportar
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

      <OrderFilters
        values={list.values}
        search={search}
        onSearch={setSearch}
        onChange={(patch) => list.set(patch)}
        showMeliLink={can('meli.operate')}
      />
      {total > 0 && (
        <p className="mb-3 text-xs text-fg-subtle">
          {pageRangeLabel(page, PAGE_SIZE, total, total === 1 ? 'venta' : 'ventas')}
        </p>
      )}

      {focusOrder && !focusInPage && ordersQuery.isSuccess && (
        <FocusedOrder
          order={focused}
          loading={focusQuery.isPending && focusQuery.fetchStatus !== 'idle'}
          busy={!!focused && busy === focused.id}
          {...actions}
        />
      )}

      {bulkReport && <BulkReportPanel report={bulkReport} onClose={() => setBulkReport(null)} />}

      {selected.size > 0 && (
        <OrdersBulkBar
          selected={[...selected.values()]}
          canFulfill={canFulfill}
          canEmit={canEmit}
          onReport={setBulkReport}
          onKeepSelected={(keep) => setSelected((prev) => new Map([...prev].filter(([id]) => keep.has(id))))}
          onClear={() => setSelected(new Map())}
          reload={load}
        />
      )}

      {firstLoad ? (
        <div className="rounded-lg border border-border bg-surface">
          <TableSkeleton rows={8} label="Cargando ventas…" />
        </div>
      ) : failedLoad ? (
        <LoadError
          title="No se pudieron cargar las ventas."
          error={ordersQuery.error}
          onRetry={() => ordersQuery.refetch()}
          retrying={ordersQuery.isFetching}
        />
      ) : orders.length === 0 ? (
        filtered ? (
          <EmptyList icon={<Search />} title="Ninguna venta coincide con la búsqueda o el filtro.">
            <button
              type="button"
              onClick={list.reset}
              className="text-sm font-medium text-primary hover:underline"
            >
              Limpiar búsqueda y filtros
            </button>
          </EmptyList>
        ) : (
          <EmptyList icon={<Package />} title="Todavía no hay ventas.">
            Cuando un cliente pague con Mercado Pago, la orden aparece acá.
          </EmptyList>
        )
      ) : narrow ? (
        // Celular: una tarjeta por venta con lo que se mira primero (número,
        // cliente, total, estado) y la acción principal, en vez de una tabla
        // que dejaba el total y el estado fuera de la pantalla.
        <div className={cn('space-y-2', ordersQuery.isPlaceholderData && 'opacity-60 transition-opacity')}>
          {orders.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              open={expanded === o.id}
              onToggle={() => setExpanded(expanded === o.id ? null : o.id)}
              selected={selected.has(o.id)}
              onSelect={() => toggleSelect(o)}
              busy={busy === o.id}
              {...actions}
            />
          ))}
        </div>
      ) : (
        <>
          <StatusLegend
            items={[
              { dot: 'bg-warning', text: 'Pendiente: esperando el pago' },
              { dot: 'bg-success', text: 'Pagada / Enviada: cobrada' },
              { dot: 'bg-info', text: 'Reembolsada' },
              { dot: 'bg-danger', text: 'Fallida / Contracargo' },
              { dot: 'bg-fg-subtle', text: 'Cancelada' },
            ]}
          />
          <div className={cn(TABLE_CARD, ordersQuery.isPlaceholderData && 'opacity-60 transition-opacity')}>
            <div className={TABLE_SCROLL_X}>
              <table className="w-full text-sm" aria-busy={ordersQuery.isPlaceholderData || undefined}>
                <thead className={TABLE_HEAD_STICKY}>
                  <tr className="border-b border-border text-left text-xs text-fg-muted">
                    <th className="w-10 px-3 py-2.5">
                      <Checkbox
                        checked={allPageSelected}
                        indeterminate={selectedOnPage > 0 && !allPageSelected}
                        onChange={toggleSelectAll}
                        aria-label="Seleccionar todas las ventas de la página"
                      />
                    </th>
                    <th className="px-4 py-2.5 font-medium">Número</th>
                    <th className="px-4 py-2.5 font-medium">Fecha</th>
                    <th className="px-4 py-2.5 font-medium">Cliente</th>
                    <th className="px-4 py-2.5 text-right font-medium">Total</th>
                    <th className="px-4 py-2.5 font-medium">Estado</th>
                    <th className="px-4 py-2.5 font-medium">Envío</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <OrderRow
                      key={o.id}
                      order={o}
                      open={expanded === o.id}
                      onToggle={() => setExpanded(expanded === o.id ? null : o.id)}
                      selected={selected.has(o.id)}
                      onSelect={() => toggleSelect(o)}
                      busy={busy === o.id}
                      {...actions}
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

// ---- Filtros -------------------------------------------------------------------

/**
 * Buscar, estado, fechas, canal, envío y cobro. Todo va en la URL y al
 * servidor; las fechas son días de Argentina ("hasta el 14" incluye el 14).
 */
function OrderFilters({
  values,
  search,
  onSearch,
  onChange,
  showMeliLink,
}: {
  values: ListValues;
  search: string;
  onSearch: (text: string) => void;
  onChange: (patch: Partial<ListValues>) => void;
  showMeliLink: boolean;
}) {
  const dateCls =
    'h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-fg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary';
  return (
    <div className="mb-2 space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
        <Input
          type="search"
          aria-label="Buscar ventas"
          className="pl-8"
          placeholder="Buscar por email, nombre o número (#A1B2C3D4)…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Select
          aria-label="Filtrar por estado"
          value={values.estado}
          onChange={(e) => onChange({ estado: e.target.value })}
          options={[
            { value: '', label: 'Todos los estados' },
            ...Object.entries(ORDER_STATUS).map(([value, meta]) => ({ value, label: meta.label })),
          ]}
        />
        <Select
          aria-label="Filtrar por canal"
          value={values.canal}
          onChange={(e) => onChange({ canal: e.target.value })}
          options={toOptions(ORDER_CHANNEL, 'Todos los canales')}
        />
        <Select
          aria-label="Filtrar por envío"
          value={values.envio}
          onChange={(e) => onChange({ envio: e.target.value })}
          options={toOptions(ORDER_SHIPPING, 'Cualquier envío')}
        />
        <Select
          aria-label="Filtrar por cobro"
          value={values.cobro}
          onChange={(e) => onChange({ cobro: e.target.value })}
          options={toOptions(ORDER_PAYMENT, 'Cualquier cobro')}
        />
        {/* Con el rótulo a la vista: un "dd/mm/aaaa" vacío no dice si es desde o hasta. */}
        <label className="relative block">
          <span className="pointer-events-none absolute -top-2 left-2 bg-surface px-1 text-3xs font-medium text-fg-subtle">
            Desde
          </span>
          <input
            type="date"
            aria-label="Desde"
            title="Ventas desde este día"
            value={values.desde}
            max={values.hasta || undefined}
            onChange={(e) => onChange({ desde: e.target.value })}
            className={dateCls}
          />
        </label>
        <label className="relative block">
          <span className="pointer-events-none absolute -top-2 left-2 bg-surface px-1 text-3xs font-medium text-fg-subtle">
            Hasta (incluido)
          </span>
          <input
            type="date"
            aria-label="Hasta"
            title="Ventas hasta este día (incluido)"
            value={values.hasta}
            min={values.desde || undefined}
            onChange={(e) => onChange({ hasta: e.target.value })}
            className={dateCls}
          />
        </label>
      </div>
      {showMeliLink && values.canal && (
        <p className="flex items-center gap-1.5 text-xs text-fg-subtle">
          <Store className="h-3.5 w-3.5" aria-hidden="true" /> Las ventas de Mercado Libre tienen su propio
          listado:{' '}
          <Link to="/mercadolibre?tab=ventas" className="font-medium text-primary hover:underline">
            Mercado Libre › Ventas
          </Link>
          .
        </p>
      )}
    </div>
  );
}

// ---- Filas y tarjetas ----------------------------------------------------------

/**
 * Una venta del listado y, desplegado, su detalle. El número es un botón: con
 * el teclado se llega a él con Tab y se abre con Enter; con el mouse alcanza
 * con tocar cualquier parte de la fila.
 */
function OrderRow({
  order: o,
  open,
  onToggle,
  selected,
  onSelect,
  busy,
  ...actions
}: {
  order: Order;
  open: boolean;
  onToggle: () => void;
  selected: boolean;
  onSelect: () => void;
  busy: boolean;
} & OrderActions) {
  const detailId = `venta-${o.id}`;
  const row = clickableRowProps(onToggle, { focusable: false });
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
        <td className="w-10 px-3 py-3">
          <Checkbox
            checked={selected}
            onChange={onSelect}
            aria-label={`Seleccionar la venta ${orderLabel(o)}`}
          />
        </td>
        <td className="whitespace-nowrap px-4 py-3">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={open ? detailId : undefined}
            aria-label={`Venta ${orderLabel(o)}: ${open ? 'ocultar' : 'ver'} detalle`}
            className="rounded font-mono text-xs font-semibold text-fg hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {orderLabel(o)}
          </button>
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-fg-muted">{formatDateTime(o.createdAtUtc)}</td>
        <td className="px-4 py-3 text-fg">{o.buyerEmail}</td>
        <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-fg">
          {money(o.total)}
        </td>
        <td className="px-4 py-3">
          <OrderStatusPill order={o} />
        </td>
        <td className="px-4 py-3">
          <ShippingPill order={o} />
        </td>
      </tr>
      {open && (
        <tr id={detailId} className="border-b border-border bg-bg-muted/40">
          <td colSpan={7} className="px-4 py-3">
            <OrderDetail order={o} busy={busy} {...actions} />
          </td>
        </tr>
      )}
    </Fragment>
  );
}

/** La venta en el celular: número, cliente, total, estado y la acción del momento. */
function OrderCard({
  order: o,
  open,
  onToggle,
  selected,
  onSelect,
  busy,
  ...actions
}: {
  order: Order;
  open: boolean;
  onToggle: () => void;
  selected: boolean;
  onSelect: () => void;
  busy: boolean;
} & OrderActions) {
  const detailId = `venta-${o.id}`;
  const canShip = o.status === 'PAID' && actions.canFulfill;
  return (
    <article
      aria-label={`Venta ${orderLabel(o)}`}
      className={cn(
        'rounded-lg border bg-surface p-3 shadow-card',
        selected ? 'border-primary/50 bg-primary/5' : 'border-border',
      )}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          checked={selected}
          onChange={onSelect}
          aria-label={`Seleccionar la venta ${orderLabel(o)}`}
          className="mt-0.5"
        />
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={open ? detailId : undefined}
          aria-label={`Venta ${orderLabel(o)}: ${open ? 'ocultar' : 'ver'} detalle`}
          className="min-w-0 flex-1 text-left"
        >
          <span className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-xs font-semibold text-fg">{orderLabel(o)}</span>
            <span className="text-base font-semibold tabular-nums text-fg">{money(o.total)}</span>
          </span>
          <span className="mt-0.5 block truncate text-sm text-fg">{o.buyerName || o.buyerEmail}</span>
          <span className="block text-xs text-fg-subtle">{formatDate(o.createdAtUtc)}</span>
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-8">
        <OrderStatusPill order={o} />
        {o.shippingStatus && <ShippingPill order={o} />}
        {canShip && !open && (
          <button
            type="button"
            onClick={() => actions.onFulfill(o)}
            disabled={busy}
            className="ml-auto inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-fg disabled:opacity-50"
          >
            {o.isPickup ? 'Lista para retirar' : 'Marcar enviada'}
          </button>
        )}
      </div>
      {open && (
        <div id={detailId} className="mt-3 border-t border-border pt-3">
          <OrderDetail order={o} busy={busy} {...actions} />
        </div>
      )}
    </article>
  );
}

/** La venta que pidió un link (?order=) cuando no está en la página que se ve. */
function FocusedOrder({
  order,
  loading,
  busy,
  ...actions
}: { order: Order | undefined; loading: boolean; busy: boolean } & OrderActions) {
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
      aria-label={`Venta ${orderLabel(order)}`}
      className="mb-4 rounded-lg border border-primary/40 bg-surface p-4"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-mono font-semibold text-fg">{orderLabel(order)}</span>
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
