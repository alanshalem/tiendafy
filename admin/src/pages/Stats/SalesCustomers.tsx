import { useQuery } from '@tanstack/react-query';
import {
  KPI_GRID,
  KpiCard,
  StatsPageHeader,
  rangeLabel,
  rangeQuery,
} from '../../components/stats/StatsToolbar';
import { useStatsRange } from '../../components/stats/useStatsRange';
import { ChartCard, Sparkline } from '../../components/charts';
import { BarChart, DonutChart, RankBars } from '../../components/charts/viz';
import { api } from '../../lib/api';
import { useStore } from '../../context/StoreContext';
import { formatDayShort, formatMoney, formatNumber } from '../../lib/format';
import { orderStatusLabel } from '../../lib/orderStatus';
import { CardsSkeleton } from '../../components/Skeleton';

interface Sales {
  currency: string;
  revenue: number;
  orders: number;
  averageOrder: number;
  newCustomers: number;
  series: { date: string; revenue: number; orders: number }[];
  byStatus: { status: string; count: number }[];
}

export function StatsSalesPage() {
  const { store } = useStore();
  const { range, setRange } = useStatsRange();
  const { data, isLoading } = useQuery({
    queryKey: ['stats-sales', store?.id, range.from, range.to],
    queryFn: () => api.get<Sales>(`/api/v1/stats/sales?${rangeQuery(range)}`),
    enabled: !!store,
  });

  return (
    <div className="space-y-5">
      <StatsPageHeader
        title="Ventas y clientes"
        description={`Período: ${rangeLabel(range)}.`}
        range={range}
        onRangeChange={setRange}
      />

      {isLoading || !data ? (
        <CardsSkeleton label="Cargando estadísticas…" />
      ) : (
        <>
          <div className={KPI_GRID}>
            <KpiCard
              title="Facturación"
              hint="Solo ventas pagadas del período."
              value={formatMoney(data.revenue, data.currency)}
            >
              <Sparkline data={data.series.map((s) => s.revenue)} />
            </KpiCard>
            <KpiCard
              title="Ventas pagadas"
              hint="Pedidos efectivamente cobrados: los cancelados no cuentan."
              value={formatNumber(data.orders)}
            />
            <KpiCard
              title="Ticket promedio"
              hint="Facturación ÷ cantidad de ventas pagadas."
              value={formatMoney(data.averageOrder, data.currency)}
            />
            <KpiCard
              title="Clientes nuevos"
              hint="Compradores que hicieron su primera compra en el período."
              value={formatNumber(data.newCustomers)}
            />
          </div>

          <ChartCard
            title="Facturación por día"
            info="Cada barra es un día con ventas cobradas. La más alta queda marcada con su fecha."
          >
            <BarChart
              data={data.series.map((s) => ({
                label: formatDayShort(s.date),
                value: s.revenue,
                title: `${formatDayShort(s.date)}: ${formatMoney(s.revenue, data.currency)} · ${s.orders} venta${s.orders === 1 ? '' : 's'}`,
              }))}
              format={(v) => formatMoney(v, data.currency)}
            />
          </ChartCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              title="Pedidos por estado"
              info="Cómo se reparten los pedidos del período. Lo que no llega a 'Pagada' es plata que se cayó en el camino."
            >
              <DonutChart
                slices={data.byStatus.map((s) => ({ label: orderStatusLabel(s.status), value: s.count }))}
                centerLabel="pedidos"
                centerValue={String(data.byStatus.reduce((t, s) => t + s.count, 0))}
              />
            </ChartCard>

            <ChartCard
              title="Días con más ventas"
              info="Los cinco días que más facturaron: sirve para saber cuándo conviene publicar o mandar una campaña."
            >
              <RankBars
                rows={[...data.series]
                  .sort((a, b) => b.revenue - a.revenue)
                  .slice(0, 5)
                  .map((s) => ({
                    label: formatDayShort(s.date),
                    value: s.revenue,
                    display: formatMoney(s.revenue, data.currency),
                    hint: `${s.orders} venta${s.orders === 1 ? '' : 's'}`,
                  }))}
                emptyLabel="Sin ventas en el período."
              />
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}
