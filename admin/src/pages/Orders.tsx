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
  items: OrderItem[];
}

const STATUS: Record<string, { label: string; cls: string }> = {
  PENDINGPAYMENT: { label: 'Pendiente', cls: 'bg-amber-100 text-amber-700' },
  PAID: { label: 'Pagada', cls: 'bg-green-100 text-green-700' },
  FAILED: { label: 'Fallida', cls: 'bg-red-100 text-red-700' },
  CANCELLED: { label: 'Cancelada', cls: 'bg-gray-100 text-gray-600' },
  REFUNDED: { label: 'Reembolsada', cls: 'bg-blue-100 text-blue-700' },
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

  const refund = useCallback(async (o: Order) => {
    if (!(await confirm({ title: 'Reembolsar', message: `¿Reembolsar ${money(o.total)} a ${o.buyerEmail}? Esto devuelve el dinero en Mercado Pago y no se puede deshacer.`, confirmLabel: 'Reembolsar', variant: 'danger' }))) return;
    setBusy(o.id);
    try {
      await api.post(`/api/v1/orders/${o.id}/refund`, {});
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo reembolsar.', { variant: 'error' });
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
                            {(o.status === 'PAID' || o.status === 'FULFILLED') && (
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
                                  <button onClick={() => refund(o)} disabled={busy === o.id} className="inline-flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">
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
    </div>
  );
}
