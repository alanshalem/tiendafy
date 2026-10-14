import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ShoppingCart } from 'lucide-react';
import { api } from '../lib/api';
import { useStore } from '../context/StoreContext';
import { formatMoney, formatDateTime, formatNumber } from '../lib/format';
import { HelpLink } from '../components/HelpLink';
import type { MoneyDto } from '@tiendafy/types';
import { TABLE_CARD, TABLE_HEAD_STICKY, TABLE_SCROLL_X } from '../lib/styles';
import { Pagination, pageRangeLabel } from '../components/Pagination';
import { TableSkeleton } from '../components/Skeleton';
import { usePageParam } from '../lib/useListParams';
import { EmptyList, PageHeader } from '@tiendafy/ui';
import { ListStats } from '../components/stats/ListStats';

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
  const [page, setPage] = usePageParam();
  const { data, isLoading } = useQuery({
    queryKey: ['abandoned-carts', store?.id, page],
    queryFn: () =>
      api.get<Abandoned>(
        `/api/v1/stats/abandoned-carts?days=30&limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}`,
      ),
    enabled: !!store,
    placeholderData: keepPreviousData,
  });

  const items = data?.items ?? [];
  const totalPages = Math.max(1, Math.ceil((data?.count ?? 0) / PAGE_SIZE));

  return (
    <div>
      <PageHeader
        className="mb-5"
        title="Carritos abandonados"
        subtitle="Checkouts iniciados que no terminaron en compra (últimos 30 días)."
        count={
          (data?.count ?? 0) > 0 &&
          pageRangeLabel(page, PAGE_SIZE, data!.count, data!.count === 1 ? 'carrito' : 'carritos')
        }
      />

      <ListStats
        className="mb-5"
        items={[
          { label: 'Carritos abandonados', value: formatNumber(data?.count ?? 0) },
          {
            label: 'Valor recuperable',
            value: formatMoney(data?.recoverableValue ?? 0),
            hint: 'Lo que suman los carritos que dejaron un email: a esos se les puede escribir.',
          },
        ]}
      />

      {isLoading ? (
        <div className="rounded-lg border border-border bg-surface">
          <TableSkeleton label="Cargando carritos…" />
        </div>
      ) : items.length === 0 ? (
        <EmptyList icon={<ShoppingCart />}>Nada abandonado por ahora. ¡Bien ahí!</EmptyList>
      ) : (
        <div className={TABLE_CARD}>
          <div className={TABLE_SCROLL_X}>
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
        </div>
      )}
      <HelpLink id="ventas" />
      <Pagination page={Math.min(page, totalPages)} totalPages={totalPages} onPage={setPage} />
    </div>
  );
}
