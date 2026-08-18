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
import { api } from '../../lib/api';
import { useStore } from '../../context/StoreContext';

interface Visits {
  totalViews: number;
  uniqueVisitors: number;
  series: { date: string; views: number; visitors: number }[];
  topPaths: { path: string; views: number }[];
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
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg border border-border bg-surface" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <KpiCard
              title="Visitas"
              hint="Páginas vistas totales del período."
              value={data.totalViews.toLocaleString('es-AR')}
            >
              <Sparkline data={data.series.map((s) => s.views)} />
            </KpiCard>
            <KpiCard
              title="Visitantes únicos"
              hint="Personas distintas (por dispositivo) que entraron a la tienda."
              value={data.uniqueVisitors.toLocaleString('es-AR')}
            >
              <Sparkline data={data.series.map((s) => s.visitors)} />
            </KpiCard>
          </div>

          <ChartCard
            title="Páginas más vistas"
            info="Las páginas de tu tienda con más visitas en el período."
          >
            {data.topPaths.length === 0 ? (
              <p className="py-4 text-sm text-fg-muted">Todavía no hay visitas registradas.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {data.topPaths.map((p) => (
                    <tr key={p.path} className="border-b border-border last:border-b-0">
                      <td className="py-2 font-mono text-xs text-fg">{p.path}</td>
                      <td className="py-2 text-right tabular-nums text-fg">{p.views}</td>
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
