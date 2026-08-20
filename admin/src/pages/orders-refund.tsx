import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Checkbox, cn } from '@tiendafy/ui';
import { api } from '../lib/api';
import { formatDate, formatMoney } from '../lib/format';
import { PlainDialog } from '../components/PlainDialog';
import { money, type Order, type RefundRecord } from './Orders';

/** Modal de reembolso: total o parcial con monto y motivo, más historial. */
export function RefundDialog({
  order,
  busy,
  onClose,
  onSubmit,
}: {
  order: Order;
  busy: boolean;
  onClose: () => void;
  onSubmit: (amount: number | null, reason: string, restock: boolean) => void;
}) {
  const refundable = order.refundable?.amount ?? order.total.amount;
  const [mode, setMode] = useState<'total' | 'partial'>('total');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [restock, setRestock] = useState(true);
  const [history, setHistory] = useState<RefundRecord[] | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .get<{ items: RefundRecord[] }>(`/api/v1/orders/${order.id}/refunds`)
      .then((d) => {
        if (alive) setHistory(d.items ?? []);
      })
      .catch(() => {
        if (alive) setHistory([]);
      });
    return () => {
      alive = false;
    };
  }, [order.id]);

  const parsed = Number(amount.replace(',', '.'));
  const amountValid = mode === 'total' || (Number.isFinite(parsed) && parsed > 0 && parsed <= refundable);

  return (
    <PlainDialog onClose={onClose}>
      <h2 className="text-lg font-bold text-fg">Reembolsar pedido</h2>
      <p className="mt-0.5 text-sm text-fg-muted">
        {order.buyerEmail} · disponible {formatMoney(refundable, order.currency)}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMode('total')}
          className={cn(
            'rounded-md border px-3 py-2 text-sm font-medium',
            mode === 'total'
              ? 'border-primary bg-primary/[0.06] text-primary'
              : 'border-border text-fg hover:bg-bg-muted',
          )}
        >
          Total ({formatMoney(refundable, order.currency)})
        </button>
        <button
          type="button"
          onClick={() => setMode('partial')}
          className={cn(
            'rounded-md border px-3 py-2 text-sm font-medium',
            mode === 'partial'
              ? 'border-primary bg-primary/[0.06] text-primary'
              : 'border-border text-fg hover:bg-bg-muted',
          )}
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
            <p className="mt-1 text-xs text-red-600">
              Ingresá un monto mayor a 0 y hasta {formatMoney(refundable, order.currency)}.
            </p>
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

      {mode === 'total' && (
        <label className="mt-3 flex items-start gap-2 text-sm text-fg">
          <Checkbox checked={restock} onChange={(e) => setRestock(e.target.checked)} className="mt-0.5" />
          <span>
            Reingresar el stock de los productos
            <span className="block text-xs text-fg-muted">
              Si la mercadería volvió al depósito, el stock se suma de nuevo (queda en el historial como
              “Devolución”). Destildalo si el producto no vuelve (dañado, extraviado).
            </span>
          </span>
        </label>
      )}

      {history && history.length > 0 && (
        <div className="mt-4 rounded-md border border-border bg-bg-muted/40 p-3">
          <div className="mb-1.5 text-xs font-semibold text-fg">Reembolsos anteriores</div>
          <div className="space-y-1">
            {history.map((r) => (
              <div key={r.id} className="flex justify-between text-xs text-fg-muted">
                <span>
                  {formatDate(r.createdAtUtc)} · {r.requestedBy}
                  {r.reason ? ` · ${r.reason}` : ''}
                </span>
                <span className="tabular-nums font-medium text-fg">{money(r.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-fg hover:bg-bg-muted"
        >
          Cancelar
        </button>
        <button
          onClick={() => onSubmit(mode === 'total' ? null : parsed, reason, mode === 'total' && restock)}
          disabled={busy || !amountValid}
          className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Reembolsar
        </button>
      </div>
    </PlainDialog>
  );
}
