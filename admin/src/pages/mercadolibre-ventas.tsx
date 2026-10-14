import { useCallback, useEffect, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, MessageSquare, Search, Send, X } from 'lucide-react';
import {
  Badge,
  Button,
  Checkbox,
  EmptyList,
  Input,
  Modal,
  Select,
  Spinner,
  StatCard,
  cn,
  useConfirm,
  useToast,
  type BadgeVariant,
} from '@tiendafy/ui';
import { api, errMsg } from '../lib/api';
import { useStore } from '../context/StoreContext';
import { usePermissions } from '../context/PermissionsContext';
import { StatusLegend } from '../components/StatusLegend';
import { SetupInvoicingLink } from '../components/SetupInvoicingLink';
import { LoadError } from '../components/LoadError';
import { fecha, moneyMajor } from './mercadolibre-shared';
import { BulkReportPanel, type BulkReport } from './orders-bulk';
import { Pagination, pageRangeLabel } from '../components/Pagination';
import { TABLE_HEAD_STICKY, TABLE_SCROLL_X } from '../lib/styles';
import { useListParams, useListSearch } from '../lib/useListParams';
import { useFiscalReady } from '../lib/useFiscalReady';
import { useIsNarrow } from '../lib/useMediaQuery';

// ---- Tipos wire --------------------------------------------------------------

interface MeliOrderItem {
  itemId: string;
  variationId: number | null;
  title: string;
  quantity: number;
  unitPrice: number;
  sku: string | null;
}

interface MeliOrder {
  meliOrderId: number;
  packId: number | null;
  status: string;
  dateCreatedUtc: string;
  totalAmount: number;
  paidAmount: number;
  currencyId: string;
  buyerNickname: string;
  buyerId: number;
  items: MeliOrderItem[];
  stockApplied: boolean;
  fiscalDocumentId: string | null;
}

interface MeliStats {
  connected: boolean;
  orders: number;
  revenue: number;
  currency: string;
  unitsSold: number;
}

// Verde = cobrada · amarillo = esperando el pago · azul = confirmada sin
// cobrar · rojo = cancelada. "Stock aplicado" NO es un estado del pago: va
// aparte en gris con tilde (antes compartía el azul con "Pago en proceso").
const ORDER_STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  paid: { label: 'Pagada', variant: 'success' },
  partially_refunded: { label: 'Reembolso parcial', variant: 'warning' },
  confirmed: { label: 'Confirmada', variant: 'info' },
  payment_required: { label: 'Espera pago', variant: 'warning' },
  payment_in_process: { label: 'Pago en proceso', variant: 'warning' },
  cancelled: { label: 'Cancelada', variant: 'danger' },
};

/** Leyenda de la tabla: qué significa cada color, en una línea arriba. */
const LEGEND = [
  { dot: 'bg-success', text: 'Pagada: la plata ya está' },
  { dot: 'bg-warning', text: 'Amarillo: esperando el pago' },
  { dot: 'bg-danger', text: 'Cancelada' },
  { dot: 'bg-fg-subtle', text: '✓ Stock aplicado: ya descontó stock local' },
];

/** Los mismos valores que entiende la API (MeliOrderFilters). */
const ESTADOS = [
  { value: '', label: 'Todas las ventas' },
  { value: 'sin-facturar', label: 'Sin facturar' },
  { value: 'facturadas', label: 'Facturadas' },
  { value: 'pagadas', label: 'Pagadas' },
  { value: 'pendientes', label: 'Esperando el pago' },
  { value: 'canceladas', label: 'Canceladas' },
];

/** Cobrada, con importe y sin comprobante: lo que se puede facturar. */
const isInvoiceable = (o: MeliOrder) =>
  (o.status === 'paid' || o.status === 'partially_refunded') &&
  !o.fiscalDocumentId &&
  (o.paidAmount > 0 || o.totalAmount > 0);

const amountOf = (o: MeliOrder) => (o.paidAmount > 0 ? o.paidAmount : o.totalAmount);

// ---- Ventas ------------------------------------------------------------------

/** Ventas de ML por página. */
const PAGE_SIZE = 25;

/**
 * Búsqueda, estado y página en la URL (el Inicio manda a "sin facturar" con
 * un link). La página tiene nombre propio: la pantalla de Mercado Libre tiene
 * varias pestañas y cada listado guarda lo suyo.
 */
const LIST_DEFAULTS = { q: '', estado: '', 'pagina-ventas': 1 };

type RowState = { state: 'working' } | { state: 'done' } | { state: 'failed'; reason: string };

export function VentasTab() {
  const { store } = useStore();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canEmit = can('fiscal.emit');
  const fiscalReady = useFiscalReady();
  const narrow = useIsNarrow();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [chatOrder, setChatOrder] = useState<MeliOrder | null>(null);

  const list = useListParams(LIST_DEFAULTS, { pageKey: 'pagina-ventas' });
  const page = list.values['pagina-ventas'];
  const [search, setSearch] = useListSearch(list);

  const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String((page - 1) * PAGE_SIZE) });
  if (list.values.q.trim()) params.set('q', list.values.q.trim());
  if (list.values.estado) params.set('estado', list.values.estado);

  // Un error al cargar se ve (LoadError del panel), no queda en "cargando".
  const ordersQuery = useQuery({
    queryKey: ['meli-orders', store?.id, params.toString()],
    queryFn: () => api.get<{ items: MeliOrder[]; total: number }>(`/api/v1/admin/meli/orders?${params}`),
    enabled: !!store,
    placeholderData: keepPreviousData,
  });
  const { data: stats } = useQuery({
    queryKey: ['meli-stats', store?.id, 30],
    queryFn: () => api.get<MeliStats>('/api/v1/admin/meli/stats?days=30'),
    enabled: !!store,
    retry: false,
  });
  const orders = ordersQuery.data?.items ?? null;
  const total = ordersQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Lo que se va facturando en esta pantalla: se ve en la fila al instante,
  // sin esperar a recargar el listado.
  const [rows, setRows] = useState<Record<number, RowState>>({});
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [progress, setProgress] = useState<string | null>(null);
  const [report, setReport] = useState<BulkReport | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['meli-orders', store?.id] });

  const invoiceable = (orders ?? []).filter((o) => isInvoiceable(o) && rows[o.meliOrderId]?.state !== 'done');
  const allSelected = invoiceable.length > 0 && invoiceable.every((o) => selected.has(o.meliOrderId));
  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** Factura una venta y deja el resultado en su fila. */
  const invoiceOne = async (o: MeliOrder): Promise<BulkReport['items'][number]> => {
    const number = `#${o.meliOrderId}`;
    setRows((r) => ({ ...r, [o.meliOrderId]: { state: 'working' } }));
    try {
      const r = await api.post<{ cae: string | null; ptoVta: number; number: number }>(
        `/api/v1/admin/meli/orders/${o.meliOrderId}/invoice`,
        {},
      );
      setRows((prev) => ({ ...prev, [o.meliOrderId]: { state: 'done' } }));
      return {
        id: String(o.meliOrderId),
        number,
        result: 'ok',
        reason: `Comprobante ${String(r.ptoVta).padStart(4, '0')}-${String(r.number).padStart(8, '0')} emitido (CAE ${r.cae ?? '—'})`,
      };
    } catch (err) {
      const reason = errMsg(err, 'No se pudo facturar la venta.');
      // Ya facturada (otra persona, o la automática): no es un error para reintentar.
      const already = /ya tiene comprobante/i.test(reason);
      setRows((prev) => ({
        ...prev,
        [o.meliOrderId]: already ? { state: 'done' } : { state: 'failed', reason },
      }));
      return { id: String(o.meliOrderId), number, result: already ? 'skipped' : 'failed', reason };
    }
  };

  // Facturación ARCA de una venta ML (consumidor final, camino de emisión manual).
  const invoice = async (o: MeliOrder) => {
    const ok = await confirm({
      title: 'Emitir comprobante ARCA',
      message: `Se factura la venta de ${o.buyerNickname || 'ML'} por ${moneyMajor(amountOf(o), o.currencyId)} a consumidor final. La emisión es real y queda registrada en ARCA.`,
      confirmLabel: 'Facturar',
    });
    if (!ok) return;
    const result = await invoiceOne(o);
    toast(result.reason!, {
      variant: result.result === 'failed' ? 'error' : 'success',
    });
    if (result.result !== 'failed') await refresh();
  };

  // De a una y en orden, con el avance a la vista. El backend no factura dos
  // veces la misma venta (si ya tiene comprobante, contesta "ya facturada"),
  // así que cortar a la mitad y volver a empezar no duplica nada.
  const invoiceSelected = async () => {
    const chosen = (orders ?? []).filter((o) => selected.has(o.meliOrderId));
    const ok = await confirm({
      title: `Facturar ${chosen.length} ${chosen.length === 1 ? 'venta' : 'ventas'} de Mercado Libre`,
      message: `Se emite un comprobante ARCA real, a consumidor final, por cada una (${moneyMajor(
        chosen.reduce((sum, o) => sum + amountOf(o), 0),
        chosen[0]?.currencyId ?? 'ARS',
      )} en total). Se facturan de a una: podés seguir el avance en la tabla.`,
      confirmLabel: 'Facturar',
    });
    if (!ok) return;
    const items: BulkReport['items'] = [];
    for (const [index, o] of chosen.entries()) {
      setProgress(`Facturando ${index + 1} de ${chosen.length}…`);
      items.push(await invoiceOne(o));
    }
    setProgress(null);
    const done = items.filter((i) => i.result === 'ok').length;
    const skipped = items.filter((i) => i.result === 'skipped').length;
    const failed = items.filter((i) => i.result === 'failed').length;
    const summary = [
      `${done} ${done === 1 ? 'facturada' : 'facturadas'}`,
      ...(skipped > 0 ? [`${skipped} ya ${skipped === 1 ? 'estaba facturada' : 'estaban facturadas'}`] : []),
      ...(failed > 0 ? [`${failed} no se ${failed === 1 ? 'pudo' : 'pudieron'} facturar`] : []),
    ].join(' · ');
    setReport({ summary, items: items.map((i) => (i.result === 'ok' ? { ...i, reason: null } : i)) });
    // Quedan elegidas las que fallaron, para reintentarlas.
    setSelected(new Set(items.filter((i) => i.result === 'failed').map((i) => Number(i.id))));
    toast(summary, { variant: failed > 0 ? 'error' : 'success' });
    await refresh();
  };

  const invoiceAction = (o: MeliOrder, compact = false) => {
    const row = rows[o.meliOrderId];
    if (o.fiscalDocumentId || row?.state === 'done') return <Badge variant="success">Facturada</Badge>;
    if (!isInvoiceable(o) || !canEmit) return null;
    if (!fiscalReady) return <SetupInvoicingLink compact />;
    return (
      <Button
        variant="secondary"
        size={compact ? 'sm' : undefined}
        disabled={row?.state === 'working' || !!progress}
        onClick={() => invoice(o)}
      >
        {row?.state === 'working' ? <Spinner inline /> : <FileText className="h-4 w-4" />} Facturar
      </Button>
    );
  };

  const statusBadges = (o: MeliOrder) => {
    const st = ORDER_STATUS[o.status] ?? { label: o.status, variant: 'neutral' as BadgeVariant };
    const row = rows[o.meliOrderId];
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={st.variant}>{st.label}</Badge>
        {o.stockApplied && <Badge variant="neutral">✓ Stock aplicado</Badge>}
        {row?.state === 'failed' && (
          <span className="text-xs text-danger" title={row.reason}>
            No se facturó: {row.reason}
          </span>
        )}
      </div>
    );
  };

  const selectable = canEmit && fiscalReady;

  return (
    <div>
      {stats && (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <StatCard
            label="Ventas ML (30 días)"
            hint="Ventas pagadas de los últimos 30 días en tu cuenta de ML."
            value={String(stats.orders)}
          />
          <StatCard
            label="Facturado en ML"
            hint="Solo ventas pagadas: las canceladas no suman."
            value={moneyMajor(stats.revenue, stats.currency)}
          />
          <StatCard
            label="Unidades vendidas"
            hint="Suma de unidades de todas las ventas pagadas."
            value={String(stats.unitsSold)}
          />
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
          <Input
            type="search"
            aria-label="Buscar ventas de Mercado Libre"
            className="pl-8"
            placeholder="Buscar por comprador, número de venta o producto…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-52">
          <Select
            aria-label="Filtrar ventas de Mercado Libre"
            value={list.values.estado}
            onChange={(e) => list.set({ estado: e.target.value })}
            options={ESTADOS}
          />
        </div>
        {canEmit && !fiscalReady && list.values.estado === 'sin-facturar' && <SetupInvoicingLink />}
      </div>

      {report && <BulkReportPanel report={report} onClose={() => setReport(null)} />}

      {selectable && selected.size > 0 && (
        <div className="sticky top-[calc(var(--header-height)+0.5rem)] z-20 mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-surface/95 px-4 py-2.5 shadow-card backdrop-blur-xl">
          <span className="text-sm font-semibold text-primary" aria-live="polite">
            {selected.size} {selected.size === 1 ? 'seleccionada' : 'seleccionadas'}
            {progress && <span className="ml-2 font-normal text-fg-muted">{progress}</span>}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={invoiceSelected} disabled={!!progress}>
              {progress ? <Spinner inline /> : <FileText className="h-4 w-4" />} Facturar seleccionadas
            </Button>
            <Button variant="ghost" onClick={() => setSelected(new Set())} disabled={!!progress}>
              <X className="h-4 w-4" /> Deseleccionar
            </Button>
          </div>
        </div>
      )}

      {orders === null ? (
        ordersQuery.isError ? (
          // Una caída se ve y se reintenta (antes quedaba en el spinner para siempre).
          <LoadError
            title="No se pudieron cargar las ventas de Mercado Libre."
            error={ordersQuery.error}
            onRetry={() => void ordersQuery.refetch()}
            retrying={ordersQuery.isFetching}
          />
        ) : (
          <Spinner />
        )
      ) : orders.length === 0 ? (
        list.filtered ? (
          <EmptyList>
            Ninguna venta coincide con la búsqueda o el filtro.{' '}
            <button type="button" onClick={list.reset} className="font-medium text-primary hover:underline">
              Limpiar
            </button>
          </EmptyList>
        ) : (
          <EmptyList>
            Todavía no hay ventas de Mercado Libre. Se importan solas con cada venta nueva (o desde
            Configuración → Mercado Libre → Importar últimas ventas).
          </EmptyList>
        )
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <StatusLegend items={LEGEND} />
            {total > 0 && (
              <span className="text-xs text-fg-subtle">
                {pageRangeLabel(page, PAGE_SIZE, total, total === 1 ? 'venta' : 'ventas')}
              </span>
            )}
          </div>
          {narrow ? (
            // Celular: tarjetas con lo que se mira (comprador, total, estado)
            // y las acciones a mano, en vez de una tabla de 760 px.
            <div className="space-y-2">
              {orders.map((o) => (
                <article
                  key={o.meliOrderId}
                  aria-label={`Venta de Mercado Libre ${o.meliOrderId}`}
                  className={cn(
                    'rounded-lg border bg-surface p-3 shadow-card',
                    selected.has(o.meliOrderId) ? 'border-primary/50 bg-primary/5' : 'border-border',
                  )}
                >
                  <div className="flex items-start gap-3">
                    {selectable && isInvoiceable(o) && rows[o.meliOrderId]?.state !== 'done' && (
                      <Checkbox
                        checked={selected.has(o.meliOrderId)}
                        onChange={() => toggle(o.meliOrderId)}
                        aria-label={`Elegir la venta ${o.meliOrderId} para facturar`}
                        className="mt-0.5"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-medium text-fg">{o.buyerNickname || '—'}</span>
                        <span className="text-base font-semibold tabular-nums text-fg">
                          {moneyMajor(o.totalAmount, o.currencyId)}
                        </span>
                      </div>
                      <p className="truncate text-xs text-fg-muted">
                        {o.items.map((i) => `${i.quantity}× ${i.title}`).join(' · ') || '—'}
                      </p>
                      <p className="text-xs text-fg-subtle">{fecha(o.dateCreatedUtc)}</p>
                    </div>
                  </div>
                  <div className="mt-2">{statusBadges(o)}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {invoiceAction(o, true)}
                    <Button variant="secondary" size="sm" onClick={() => setChatOrder(o)}>
                      <MessageSquare className="h-4 w-4" /> Mensajes
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className={`${TABLE_SCROLL_X} rounded-lg border border-border bg-surface shadow-card`}>
              <table className="w-full min-w-[760px] text-sm">
                <thead className={TABLE_HEAD_STICKY}>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-fg-subtle">
                    {selectable && (
                      <th className="w-10 px-3 py-3">
                        <Checkbox
                          checked={allSelected}
                          indeterminate={!allSelected && invoiceable.some((o) => selected.has(o.meliOrderId))}
                          disabled={invoiceable.length === 0}
                          onChange={() =>
                            setSelected(
                              allSelected ? new Set() : new Set(invoiceable.map((o) => o.meliOrderId)),
                            )
                          }
                          aria-label="Elegir todas las ventas sin facturar de la página"
                        />
                      </th>
                    )}
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Comprador</th>
                    <th className="px-4 py-3">Productos</th>
                    <th className="px-4 py-3">Total</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {orders.map((o) => (
                    <tr key={o.meliOrderId} className={cn(selected.has(o.meliOrderId) && 'bg-primary/5')}>
                      {selectable && (
                        <td className="w-10 px-3 py-3">
                          {isInvoiceable(o) && rows[o.meliOrderId]?.state !== 'done' && (
                            <Checkbox
                              checked={selected.has(o.meliOrderId)}
                              onChange={() => toggle(o.meliOrderId)}
                              aria-label={`Elegir la venta ${o.meliOrderId} para facturar`}
                            />
                          )}
                        </td>
                      )}
                      <td className="whitespace-nowrap px-4 py-3 text-fg-muted">{fecha(o.dateCreatedUtc)}</td>
                      <td className="px-4 py-3 font-medium text-fg">{o.buyerNickname || '—'}</td>
                      <td className="max-w-[280px] px-4 py-3 text-fg-muted">
                        {o.items.map((i) => `${i.quantity}× ${i.title}`).join(' · ') || '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-semibold text-fg">
                        {moneyMajor(o.totalAmount, o.currencyId)}
                      </td>
                      <td className="px-4 py-3">{statusBadges(o)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {invoiceAction(o)}
                          <Button variant="secondary" onClick={() => setChatOrder(o)}>
                            <MessageSquare className="h-4 w-4" /> Mensajes
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination
            page={Math.min(page, totalPages)}
            totalPages={totalPages}
            onPage={(p) => list.set({ 'pagina-ventas': p })}
          />
        </>
      )}

      {chatOrder && <MessagesModal order={chatOrder} onClose={() => setChatOrder(null)} />}
    </div>
  );
}

function MessagesModal({ order, onClose }: { order: MeliOrder; onClose: () => void }) {
  const { toast } = useToast();
  const packId = order.packId ?? order.meliOrderId;
  const [messages, setMessages] = useState<
    { text: string | null; dateCreated: string | null; fromSeller: boolean }[] | null
  >(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    api
      .get<{ messages: { text: string | null; dateCreated: string | null; fromSeller: boolean }[] }>(
        `/api/v1/admin/meli/packs/${packId}/messages`,
      )
      .then((r) => setMessages(r.messages))
      .catch((err) => {
        toast(errMsg(err, 'No se pudieron cargar los mensajes.'), { variant: 'error' });
        setMessages([]);
      });
  }, [packId, toast]);

  useEffect(load, [load]);

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      await api.post(`/api/v1/admin/meli/packs/${packId}/messages`, { text: text.trim() });
      setText('');
      load();
    } catch (err) {
      toast(errMsg(err, 'No se pudo enviar el mensaje.'), { variant: 'error' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Chat con ${order.buyerNickname || 'el comprador'}`} size="md">
      <div className="max-h-[50vh] space-y-2 overflow-y-auto rounded-lg bg-bg-subtle p-3">
        {messages === null ? (
          <Spinner />
        ) : messages.length === 0 ? (
          <p className="py-6 text-center text-sm text-fg-muted">
            Sin mensajes. En Mercado Libre la conversación la inicia el comprador.
          </p>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`flex ${m.fromSeller ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                  m.fromSeller ? 'bg-primary text-primary-fg' : 'border border-border bg-surface text-fg'
                }`}
              >
                {m.text}
                <div className={`mt-0.5 text-3xs ${m.fromSeller ? 'text-primary-fg/70' : 'text-fg-subtle'}`}>
                  {fecha(m.dateCreated)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <Input
          aria-label="Mensaje para el comprador"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={350}
          placeholder="Escribí tu respuesta (máx. 350 caracteres)…"
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <Button aria-label="Enviar" onClick={send} disabled={sending || !text.trim()}>
          {sending ? <Spinner inline /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </Modal>
  );
}
