import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { KpiCard, StatsPageHeader, StatsToolbar, defaultStatsRange, rangeLabel, rangeQuery } from '../../components/stats/StatsToolbar';
import { ChartCard, Sparkline } from '../../components/charts';
import { api } from '../../lib/api';
import { useStore } from '../../context/StoreContext';
import { formatMoney } from '../../lib/format';

interface Sales {
  currency: string;
  revenue: number;
  orders: number;
  averageOrder: number;
  newCustomers: number;
  series: { date: string; revenue: number; orders: number }[];
  byStatus: { status: string; count: number }[];
}

const money = formatMoney;

const STATUS_LABEL: Record<string, string> = {
  PENDINGPAYMENT: 'Pendiente', PAID: 'Pagada', FAILED: 'Fallida',
  CANCELLED: 'Cancelada', REFUNDED: 'Reembolsada', CHARGEDBACK: 'Contracargo', FULFILLED: 'Entregada',
};

export function StatsSalesPage() {
  const { store } = useStore();
  const [range, setRange] = useState(defaultStatsRange());
  const { data, isLoading } = useQuery({
    queryKey: ['stats-sales', store?.id, range.from, range.to],
    queryFn: () => api.get<Sales>(`/api/v1/stats/sales?${rangeQuery(range)}`),
    enabled: !!store,
  });

  return (
    <div className="space-y-5">
      <StatsToolbar value={range} onChange={setRange} />
      <StatsPageHeader title="Ventas y clientes" />
      <p className="-mt-3 text-sm text-fg-muted">Período: {rangeLabel(range)}.</p>

      {isLoading || !data ? (
        <div className="grid gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-32 animate-pulse rounded-lg border border-border bg-surface" />)}
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-4">
            <KpiCard title="Facturación" value={money(data.revenue, data.currency)}>
              <Sparkline data={data.series.map((s) => s.revenue)} />
            </KpiCard>
            <KpiCard title="Ventas pagadas" value={data.orders.toLocaleString('es-AR')} />
            <KpiCard title="Ticket promedio" value={money(data.averageOrder, data.currency)} />
            <KpiCard title="Clientes nuevos" value={data.newCustomers.toLocaleString('es-AR')} />
          </div>

          <ChartCard title="Pedidos por estado" info>
            {data.byStatus.length === 0 ? (
              <p className="py-4 text-sm text-fg-muted">Sin pedidos en el período.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {data.byStatus.map((s) => (
                    <tr key={s.status} className="border-b border-border last:border-b-0">
                      <td className="py-2 text-fg">{STATUS_LABEL[s.status] ?? s.status}</td>
                      <td className="py-2 text-right tabular-nums text-fg">{s.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </ChartCard>
        </>
      )}
    </div>
  );
}
