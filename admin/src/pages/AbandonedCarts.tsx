import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, ShoppingCart } from 'lucide-react';
import { api } from '../lib/api';
import { useStore } from '../context/StoreContext';
import { formatMoney, formatDateTime, formatNumber } from '../lib/format';
import { HelpLink } from '../components/HelpLink';
import type { MoneyDto } from '@tiendafy/types';
import { SETTINGS_CARD, TABLE_CARD, TABLE_HEAD_STICKY } from '../lib/styles';
import { Pagination, pageRangeLabel } from '../components/Pagination';

interface Abandoned {
  count: number;
  recoverableValue: number;
  items: {
    id: string;
    email: string | null;
    createdAtUtc: string;
    items: number;
    total: MoneyDto;
    recoverable: boolean;
  }[];
}

/** Carritos por página. */
const PAGE_SIZE = 25;

export function AbandonedCartsPage() {
  const { store } = useStore();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['abandoned-carts', store?.id, page],
    queryFn: () =>
      api.get<Abandoned>(
        `/api/v1/stats/abandoned-carts?days=30&limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}`,
      ),
    enabled: !!store,
  });

  const items = data?.items ?? [];
  const totalPages = Math.max(1, Math.ceil((data?.count ?? 0) / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-5xl px-6 py-6">
      <h1 className="mb-1 text-2xl font-bold text-fg">Carritos abandonados</h1>
      <p className="mb-5 text-sm text-fg-muted">
        Checkouts iniciados que no terminaron en compra (últimos 30 días).
        {(data?.count ?? 0) > 0 && (
          <span className="ml-2 text-xs text-fg-subtle">
            {pageRangeLabel(page, PAGE_SIZE, data!.count, data!.count === 1 ? 'carrito' : 'carritos')}
          </span>
        )}
      </p>

      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <div className={SETTINGS_CARD}>
          <div className="text-sm font-semibold text-fg">Carritos abandonados</div>
          <div className="mt-2 text-3xl font-bold text-fg">{formatNumber(data?.count ?? 0)}</div>
        </div>
        <div className={SETTINGS_CARD}>
          <div className="text-sm font-semibold text-fg">Valor recuperable</div>
          <div className="mt-2 text-3xl font-bold text-fg">{formatMoney(data?.recoverableValue ?? 0)}</div>
          <div className="mt-1 text-xs text-fg-subtle">De carritos con email.</div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-16 text-sm text-fg-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-16 text-center text-fg-muted">
          <ShoppingCart className="h-8 w-8 opacity-50" />
          <p>Nada abandonado por ahora. ¡Bien ahí!</p>
        </div>
      ) : (
        <div className={TABLE_CARD}>
          <table className="w-full text-sm">
            <thead className={TABLE_HEAD_STICKY}>
              <tr className="border-b border-border text-left text-xs text-fg-muted">
                <th className="px-4 py-2.5 font-medium">Fecha</th>
                <th className="px-4 py-2.5 font-medium">Cliente</th>
                <th className="px-4 py-2.5 text-center font-medium">Ítems</th>
                <th className="px-4 py-2.5 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-3 text-fg-muted">{formatDateTime(c.createdAtUtc)}</td>
                  <td className="px-4 py-3 text-fg">
                    {c.email ?? <span className="text-fg-subtle">Sin email (no recuperable)</span>}
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums">{c.items}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-fg">
                    {formatMoney(c.total.amount, c.total.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <HelpLink id="ventas" />
      <Pagination page={page} totalPages={totalPages} onPage={setPage} />
    </div>
  );
}
