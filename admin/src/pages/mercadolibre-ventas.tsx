import { useCallback, useEffect, useState } from 'react';
import { FileText, Loader2, MessageSquare, Send } from 'lucide-react';
import {
  Badge,
  Button,
  EmptyList,
  Input,
  Modal,
  Spinner,
  StatCard,
  useConfirm,
  useToast,
  type BadgeVariant,
} from '@tiendafy/ui';
import { api, errMsg } from '../lib/api';
import { StatusLegend } from '../components/StatusLegend';
import { fecha, moneyMajor } from './mercadolibre-shared';
import { Pagination, pageRangeLabel } from '../components/Pagination';
import { TABLE_HEAD_STICKY, TABLE_SCROLL_X } from '../lib/styles';

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
  { dot: 'bg-gray-400', text: '✓ Stock aplicado: ya descontó stock local' },
];

// ---- Ventas ------------------------------------------------------------------

/** Ventas de ML por página. */
const PAGE_SIZE = 25;

export function VentasTab() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [orders, setOrders] = useState<MeliOrder[] | null>(null);
  const [stats, setStats] = useState<MeliStats | null>(null);
  const [chatOrder, setChatOrder] = useState<MeliOrder | null>(null);
  const [invoicing, setInvoicing] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Facturación ARCA de la venta ML (consumidor final, camino de emisión manual).
  const invoice = async (o: MeliOrder) => {
    const ok = await confirm({
      title: 'Emitir comprobante ARCA',
      message: `Se factura la venta de ${o.buyerNickname || 'ML'} por ${moneyMajor(o.paidAmount > 0 ? o.paidAmount : o.totalAmount, o.currencyId)} a consumidor final. La emisión es real y queda registrada en ARCA.`,
      confirmLabel: 'Facturar',
    });
    if (!ok) return;
    setInvoicing(o.meliOrderId);
    try {
      const r = await api.post<{ cae: string | null; ptoVta: number; number: number }>(
        `/api/v1/admin/meli/orders/${o.meliOrderId}/invoice`,
        {},
      );
      toast(
        `Comprobante ${String(r.ptoVta).padStart(4, '0')}-${String(r.number).padStart(8, '0')} emitido (CAE ${r.cae ?? '—'})`,
        {
          variant: 'success',
        },
      );
      setOrders(
        (prev) =>
          prev?.map((x) => (x.meliOrderId === o.meliOrderId ? { ...x, fiscalDocumentId: 'ok' } : x)) ?? null,
      );
    } catch (err) {
      toast(errMsg(err, 'No se pudo facturar la venta.'), { variant: 'error' });
    } finally {
      setInvoicing(null);
    }
  };

  useEffect(() => {
    api
      .get<{ items: MeliOrder[]; total: number }>(
        `/api/v1/admin/meli/orders?limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}`,
      )
      .then((r) => {
        setOrders(r.items);
        setTotal(r.total ?? 0);
      });
    api
      .get<MeliStats>('/api/v1/admin/meli/stats?days=30')
      .then(setStats)
      .catch(() => undefined);
  }, [page]);

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

      {orders === null ? (
        <Spinner />
      ) : orders.length === 0 ? (
        <EmptyList>
          Todavía no hay ventas de Mercado Libre. Se importan solas con cada venta nueva (o desde
          Configuración → Mercado Libre → Importar últimas ventas).
        </EmptyList>
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
          <div className={`${TABLE_SCROLL_X} rounded-lg border border-border bg-surface shadow-card`}>
            <table className="w-full min-w-[760px] text-sm">
              <thead className={TABLE_HEAD_STICKY}>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-fg-subtle">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Comprador</th>
                  <th className="px-4 py-3">Productos</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orders.map((o) => {
                  const st = ORDER_STATUS[o.status] ?? {
                    label: o.status,
                    variant: 'neutral' as BadgeVariant,
                  };
                  return (
                    <tr key={o.meliOrderId}>
                      <td className="px-4 py-3 text-fg-muted">{fecha(o.dateCreatedUtc)}</td>
                      <td className="px-4 py-3 font-medium text-fg">{o.buyerNickname || '—'}</td>
                      <td className="max-w-[280px] px-4 py-3 text-fg-muted">
                        {o.items.map((i) => `${i.quantity}× ${i.title}`).join(' · ') || '—'}
                      </td>
                      <td className="px-4 py-3 font-semibold text-fg">
                        {moneyMajor(o.totalAmount, o.currencyId)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant={st.variant}>{st.label}</Badge>
                          {o.stockApplied && <Badge variant="neutral">✓ Stock aplicado</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {o.fiscalDocumentId ? (
                            <Badge variant="success">Facturada</Badge>
                          ) : (
                            o.status === 'paid' && (
                              <Button
                                variant="secondary"
                                disabled={invoicing === o.meliOrderId}
                                onClick={() => invoice(o)}
                              >
                                {invoicing === o.meliOrderId ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <FileText className="h-4 w-4" />
                                )}{' '}
                                Facturar
                              </Button>
                            )
                          )}
                          <Button variant="secondary" onClick={() => setChatOrder(o)}>
                            <MessageSquare className="h-4 w-4" /> Mensajes
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
                <div
                  className={`mt-0.5 text-[10px] ${m.fromSeller ? 'text-primary-fg/70' : 'text-fg-subtle'}`}
                >
                  {fecha(m.dateCreated)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={350}
          placeholder="Escribí tu respuesta (máx. 350 caracteres)…"
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <Button onClick={send} disabled={sending || !text.trim()}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </Modal>
  );
}
