import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  KpiCard,
  StatsPageHeader,
  StatsToolbar,
  defaultStatsRange,
  rangeLabel,
  rangeQuery,
} from '../../components/stats/StatsToolbar';
import { ChartCard, Sparkline } from '../../components/charts';
import { BarChart, Delta, RankBars } from '../../components/charts/viz';
import { formatDayShort } from '../../lib/format';
import { api } from '../../lib/api';
import { useStore } from '../../context/StoreContext';

interface Visits {
  totalViews: number;
  uniqueVisitors: number;
  orders: number;
  conversionPct: number;
  previous: { totalViews: number; uniqueVisitors: number; orders: number; conversionPct: number };
  series: { date: string; views: number; visitors: number }[];
  topPaths: { path: string; views: number }[];
  topSources: { source: string; views: number }[];
}

export function StatsVisitsPage() {
  const { store } = useStore();
  const [range, setRange] = useState(defaultStatsRange('Últimos 7 días'));
  const { data, isLoading } = useQuery({
    queryKey: ['stats-visits', store?.id, range.from, range.to],
    queryFn: () => api.get<Visits>(`/api/v1/stats/visits?${rangeQuery(range)}`),
    enabled: !!store,
  });

  return (
    <div className="space-y-5">
      <StatsToolbar value={range} onChange={setRange} />
      <StatsPageHeader title="Visitas" />
      <p className="-mt-3 text-sm text-fg-muted">Período: {rangeLabel(range)}.</p>

      {isLoading || !data ? (
        <div className="grid gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg border border-border bg-surface" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              title="Visitas"
              hint="Páginas vistas totales del período."
              value={data.totalViews.toLocaleString('es-AR')}
            >
              <Sparkline data={data.series.map((s) => s.views)} />
              <div className="mt-1">
                <Delta current={data.totalViews} previous={data.previous.totalViews} />
              </div>
            </KpiCard>
            <KpiCard
              title="Visitantes únicos"
              hint="Personas distintas (por dispositivo) que entraron a la tienda."
              value={data.uniqueVisitors.toLocaleString('es-AR')}
            >
              <Sparkline data={data.series.map((s) => s.visitors)} />
              <div className="mt-1">
                <Delta current={data.uniqueVisitors} previous={data.previous.uniqueVisitors} />
              </div>
            </KpiCard>
            <KpiCard
              title="Conversión"
              hint="De cada 100 visitantes distintos, cuántos terminaron comprando. Es la métrica que convierte «tuve mucha visita» en «sirvió»."
              value={`${data.conversionPct.toLocaleString('es-AR')}%`}
            >
              <Delta current={data.conversionPct} previous={data.previous.conversionPct} />
            </KpiCard>
            <KpiCard
              title="Ventas del período"
              hint="Ventas cobradas en el mismo período, para poner las visitas en contexto."
              value={data.orders.toLocaleString('es-AR')}
            >
              <Delta current={data.orders} previous={data.previous.orders} />
            </KpiCard>
          </div>

          <ChartCard
            title="Visitas por día"
            info="Cada barra es un día. La más alta queda marcada con su fecha."
          >
            <BarChart
              data={data.series.map((s) => ({
                label: formatDayShort(s.date),
                value: s.views,
                title: `${formatDayShort(s.date)}: ${s.views} visita${s.views === 1 ? '' : 's'} · ${s.visitors} visitante${s.visitors === 1 ? '' : 's'}`,
              }))}
            />
          </ChartCard>

          <ChartCard
            title="Fuentes de tráfico"
            info="De dónde vienen las visitas: los links con utm_source (redes, email) se atribuyen a su canal; el resto es directo u orgánico."
          >
            <RankBars
              rows={data.topSources.map((src) => ({
                label: src.source,
                value: src.views,
                display: src.views.toLocaleString('es-AR'),
              }))}
              emptyLabel="Sin visitas en el período."
            />
          </ChartCard>

          <ChartCard
            title="Páginas más vistas"
            info="Las páginas de tu tienda con más visitas en el período."
          >
            <RankBars
              rows={data.topPaths.map((p) => ({
                label: p.path,
                value: p.views,
                display: p.views.toLocaleString('es-AR'),
              }))}
              emptyLabel="Todavía no hay visitas registradas."
            />
          </ChartCard>
        </>
      )}
    </div>
  );
}
