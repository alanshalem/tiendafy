import { Fragment, useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Package, Truck, Undo2 } from 'lucide-react';
import { cn, useToast, useConfirm, usePrompt } from '@tiendafy/ui';
import type { MoneyDto as Money } from '@tiendafy/types';
import { api } from '../lib/api';
import { useStore } from '../context/StoreContext';
import { formatMoney } from '../lib/format';

interface OrderItem {
  variantId: string;
  productName: string;
  variantDescription: string;
  sku: string;
  quantity: number;
  unitPrice: Money;
}
interface Order {
  id: string;
  status: string;
  buyerEmail: string;
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

interface RefundRecord {
  id: string;
  amount: Money;
  isTotal: boolean;
  reason: string | null;
  requestedBy: string;
  mpRefundId: string | null;
  createdAtUtc: string;
}

const STATUS: Record<string, { label: string; cls: string }> = {
  PENDINGPAYMENT: { label: 'Pendiente', cls: 'bg-amber-100 text-amber-700' },
  PAID: { label: 'Pagada', cls: 'bg-green-100 text-green-700' },
  FAILED: { label: 'Fallida', cls: 'bg-red-100 text-red-700' },
  CANCELLED: { label: 'Cancelada', cls: 'bg-gray-100 text-gray-600' },
  REFUNDED: { label: 'Reembolsada', cls: 'bg-blue-100 text-blue-700' },
  PARTIALLYREFUNDED: { label: 'Reembolso parcial', cls: 'bg-sky-100 text-sky-700' },
  CHARGEDBACK: { label: 'Contracargo', cls: 'bg-rose-100 text-rose-700' },
  FULFILLED: { label: 'Entregada', cls: 'bg-green-100 text-green-700' },
};

const money = (m: Money) => formatMoney(m.amount, m.currency);

export function OrdersPage() {
  const { store } = useStore();
  const { toast } = useToast();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ items: Order[] }>('/api/v1/orders?limit=50');
      setOrders(data.items ?? []);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fulfill = useCallback(async (o: Order) => {
    const tracking = await prompt({ title: 'Marcar como enviada', message: 'Código de seguimiento (opcional):', defaultValue: o.tracking ?? '', placeholder: 'Ej: AR123456789', confirmLabel: 'Marcar enviada' });
    if (tracking === null) return; // canceló
    setBusy(o.id);
    try {
      await api.post(`/api/v1/orders/${o.id}/fulfill`, { tracking: tracking.trim() || null });
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo marcar como enviada.', { variant: 'error' });
    } finally {
      setBusy(null);
    }
  }, [load, prompt, toast]);

  const [refunding, setRefunding] = useState<Order | null>(null);

  const doRefund = useCallback(async (o: Order, amount: number | null, reason: string) => {
    const label = amount === null ? money(o.refundable ?? o.total) : formatMoney(amount, o.currency);
    if (!(await confirm({ title: 'Confirmar reembolso', message: `¿Reembolsar ${label} a ${o.buyerEmail}? Esto devuelve el dinero en Mercado Pago y no se puede deshacer.`, confirmLabel: 'Reembolsar', variant: 'danger' }))) return false;
    setBusy(o.id);
    try {
      await api.post(`/api/v1/orders/${o.id}/refund`, { amount, reason: reason.trim() || null });
      toast('Reembolso realizado', { variant: 'success' });
      await load();
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo reembolsar.', { variant: 'error' });
      return false;
    } finally {
      setBusy(null);
    }
  }, [load, confirm, toast]);

  useEffect(() => {
    if (store) load();
  }, [store, load]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-6">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-fg">Ventas</h1>
        <button onClick={load} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-fg hover:bg-bg-muted">
          <RefreshCw className="h-4 w-4" /> Actualizar
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-16 text-sm text-fg-muted"><Loader2 className="h-4 w-4 animate-spin" /> Cargando ventas…</div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-16 text-center text-fg-muted">
          <Package className="h-8 w-8 opacity-50" />
          <p>Todavía no hay ventas.</p>
          <p className="text-xs">Cuando un cliente pague con Mercado Pago, la orden aparece acá.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-card">
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
              {orders.map((o) => {
                const st = STATUS[o.status] ?? { label: o.status, cls: 'bg-gray-100 text-gray-600' };
                const open = expanded === o.id;
                return (
                  <Fragment key={o.id}>
                    <tr onClick={() => setExpanded(open ? null : o.id)} className="cursor-pointer border-b border-border last:border-b-0 hover:bg-bg-muted">
                      <td className="px-4 py-3 text-fg-muted">{new Date(o.createdAtUtc).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="px-4 py-3 text-fg">{o.buyerEmail}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-fg">{money(o.total)}</td>
                      <td className="px-4 py-3"><span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', st.cls)}>{st.label}</span></td>
                    </tr>
                    {open && (
                      <tr className="border-b border-border bg-bg-muted/40">
                        <td colSpan={4} className="px-4 py-3">
                          <div className="space-y-1.5">
                            {o.items.map((i) => (
                              <div key={i.variantId} className="flex justify-between text-xs">
                                <span className="text-fg">{i.quantity}× {i.productName}{i.variantDescription ? ` · ${i.variantDescription}` : ''}</span>
                                <span className="tabular-nums text-fg-muted">{money({ amount: i.unitPrice.amount * i.quantity, currency: i.unitPrice.currency })}</span>
                              </div>
                            ))}
                            {o.discount && o.discount.amount > 0 && (
                              <div className="flex justify-between text-xs text-green-600">
                                <span>Descuento{o.couponCode ? ` (${o.couponCode})` : ''}</span>
                                <span className="tabular-nums">- {money(o.discount)}</span>
                              </div>
                            )}
                            {o.paymentId && <div className="pt-1 text-xs text-fg-subtle">Pago MP #{o.paymentId}{o.paidAtUtc ? ` · ${new Date(o.paidAtUtc).toLocaleString('es-AR')}` : ''}</div>}
                            {o.tracking && <div className="text-xs text-fg-subtle">Seguimiento: {o.tracking}{o.fulfilledAtUtc ? ` · enviada ${new Date(o.fulfilledAtUtc).toLocaleDateString('es-AR')}` : ''}</div>}
                            {o.refunded && o.refunded.amount > 0 && (
                              <div className="text-xs font-medium text-blue-600">
                                Reembolsado: {money(o.refunded)}{o.refundable && o.refundable.amount > 0 ? ` · queda ${money(o.refundable)}` : ' (total)'}
                              </div>
                            )}
                            {(o.status === 'PAID' || o.status === 'FULFILLED' || o.status === 'PARTIALLYREFUNDED') && (
                              <div className="flex flex-wrap gap-2 pt-2" onClick={(e) => e.stopPropagation()}>
                                {o.status === 'PAID' && (
                                  <button onClick={() => fulfill(o)} disabled={busy === o.id} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg hover:opacity-90 disabled:opacity-50">
                                    {busy === o.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Truck className="h-3.5 w-3.5" />} Marcar enviada
                                  </button>
                                )}
                                {o.status === 'FULFILLED' && (
                                  <button onClick={() => fulfill(o)} disabled={busy === o.id} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-fg hover:bg-bg-muted disabled:opacity-50">
                                    <Truck className="h-3.5 w-3.5" /> Editar seguimiento
                                  </button>
                                )}
                                {o.paymentId && (
                                  <button onClick={() => setRefunding(o)} disabled={busy === o.id} className="inline-flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">
                                    {busy === o.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />} Reembolsar
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
    </div>
  );
}

/** Modal de reembolso: total o parcial con monto y motivo, más historial. */
function RefundDialog({
  order,
  busy,
  onClose,
  onSubmit,
}: {
  order: Order;
  busy: boolean;
  onClose: () => void;
  onSubmit: (amount: number | null, reason: string) => void;
}) {
  const refundable = order.refundable?.amount ?? order.total.amount;
  const [mode, setMode] = useState<'total' | 'partial'>('total');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [history, setHistory] = useState<RefundRecord[] | null>(null);

  useEffect(() => {
    let alive = true;
    api.get<{ items: RefundRecord[] }>(`/api/v1/orders/${order.id}/refunds`)
      .then((d) => { if (alive) setHistory(d.items ?? []); })
      .catch(() => { if (alive) setHistory([]); });
    return () => { alive = false; };
  }, [order.id]);

  const parsed = Number(amount.replace(',', '.'));
  const amountValid = mode === 'total' || (Number.isFinite(parsed) && parsed > 0 && parsed <= refundable);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-fg">Reembolsar pedido</h2>
        <p className="mt-0.5 text-sm text-fg-muted">
          {order.buyerEmail} · disponible {formatMoney(refundable, order.currency)}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode('total')}
            className={cn('rounded-md border px-3 py-2 text-sm font-medium', mode === 'total' ? 'border-primary bg-primary/[0.06] text-primary' : 'border-border text-fg hover:bg-bg-muted')}
          >
            Total ({formatMoney(refundable, order.currency)})
          </button>
          <button
            type="button"
            onClick={() => setMode('partial')}
            className={cn('rounded-md border px-3 py-2 text-sm font-medium', mode === 'partial' ? 'border-primary bg-primary/[0.06] text-primary' : 'border-border text-fg hover:bg-bg-muted')}
          >
            Parcial
          </button>
        </div>

        {mode === 'partial' && (
          <div className="mt-3">
            <label className="mb-1 block text-sm font-medium text-fg">Monto a reembolsar</label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder={`Hasta ${formatMoney(refundable, order.currency)}`}
              className="h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {amount && !amountValid && (
              <p className="mt-1 text-xs text-red-600">Ingresá un monto mayor a 0 y hasta {formatMoney(refundable, order.currency)}.</p>
            )}
          </div>
        )}

        <div className="mt-3">
          <label className="mb-1 block text-sm font-medium text-fg">Motivo (opcional)</label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            placeholder="Ej: producto dañado, arrepentimiento…"
            className="h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {history && history.length > 0 && (
          <div className="mt-4 rounded-md border border-border bg-bg-muted/40 p-3">
            <div className="mb-1.5 text-xs font-semibold text-fg">Reembolsos anteriores</div>
            <div className="space-y-1">
              {history.map((r) => (
                <div key={r.id} className="flex justify-between text-xs text-fg-muted">
                  <span>{new Date(r.createdAtUtc).toLocaleDateString('es-AR')} · {r.requestedBy}{r.reason ? ` · ${r.reason}` : ''}</span>
                  <span className="tabular-nums font-medium text-fg">{money(r.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm font-medium text-fg hover:bg-bg-muted">
            Cancelar
          </button>
          <button
            onClick={() => onSubmit(mode === 'total' ? null : parsed, reason)}
            disabled={busy || !amountValid}
            className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Reembolsar
          </button>
        </div>
      </div>
    </div>
  );
}
