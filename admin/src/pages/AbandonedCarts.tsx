import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ShoppingCart } from 'lucide-react';
import { api } from '../lib/api';
import { useStore } from '../context/StoreContext';
import { formatMoney, formatDateTime, formatNumber } from '../lib/format';
import { HelpLink } from '../components/HelpLink';
import type { MoneyDto } from '@tiendafy/types';
import { TABLE_CARD } from '../lib/styles';
import { Pagination, pageRangeLabel } from '../components/Pagination';
import { TableSkeleton } from '../components/Skeleton';
import { usePageParam } from '../lib/useListParams';
import { EmptyList, PageHeader, Table } from '@tiendafy/ui';
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
          <Table
            rows={items}
            rowKey={(c) => c.id}
            columns={[
              {
                key: 'date',
                header: 'Fecha',
                cell: (c) => <span className="text-fg-muted">{formatDateTime(c.createdAtUtc)}</span>,
              },
              {
                key: 'email',
                header: 'Cliente',
                cell: (c) => c.email ?? <span className="text-fg-subtle">Sin email (no recuperable)</span>,
              },
              { key: 'items', header: 'Ítems', align: 'center', className: 'tabular-nums' },
              {
                key: 'total',
                header: 'Total',
                align: 'right',
                className: 'font-semibold tabular-nums',
                cell: (c) => formatMoney(c.total.amount, c.total.currency),
              },
            ]}
          />
        </div>
      )}
      <HelpLink id="ventas" />
      <Pagination page={Math.min(page, totalPages)} totalPages={totalPages} onPage={setPage} />
    </div>
  );
}
