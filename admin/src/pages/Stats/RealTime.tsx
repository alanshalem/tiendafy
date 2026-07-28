import { useQuery } from '@tanstack/react-query';
import { KpiCard, StatsPageHeader } from '../../components/stats/StatsToolbar';
import { ChartCard } from '../../components/charts';
import { api } from '../../lib/api';
import { useStore } from '../../context/StoreContext';

interface RealTime {
  activeVisitors: number;
  views: number;
  recent: { path: string; occurredAtUtc: string }[];
  activePaths: { path: string; visitors: number }[];
}

export function StatsRealTimePage() {
  const { store } = useStore();
  const { data } = useQuery({
    queryKey: ['stats-realtime', store?.id],
    queryFn: () => api.get<RealTime>('/api/v1/stats/realtime'),
    enabled: !!store,
    refetchInterval: 10000, // refresca cada 10s
  });

  return (
    <div className="space-y-5">
      <StatsPageHeader title="Tiempo real" />
      <p className="-mt-3 text-sm text-fg-muted">Actividad de los últimos 5 minutos · se actualiza solo.</p>

      <div className="grid gap-4 lg:grid-cols-2">
        <KpiCard title="Visitantes activos" value={(data?.activeVisitors ?? 0).toLocaleString('es-AR')} />
        <KpiCard title="Vistas (5 min)" value={(data?.views ?? 0).toLocaleString('es-AR')} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Páginas activas" info>
          {!data || data.activePaths.length === 0 ? (
            <p className="py-4 text-sm text-fg-muted">Nadie navegando ahora mismo.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {data.activePaths.map((p) => (
                  <tr key={p.path} className="border-b border-border last:border-b-0">
                    <td className="py-2 font-mono text-xs text-fg">{p.path}</td>
                    <td className="py-2 text-right tabular-nums text-fg">{p.visitors}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ChartCard>

        <ChartCard title="Últimas vistas" info>
          {!data || data.recent.length === 0 ? (
            <p className="py-4 text-sm text-fg-muted">Sin actividad.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {data.recent.map((r, i) => (
                  <tr key={i} className="border-b border-border last:border-b-0">
                    <td className="py-2 font-mono text-xs text-fg">{r.path}</td>
                    <td className="py-2 text-right text-xs text-fg-muted">
                      {new Date(r.occurredAtUtc).toLocaleTimeString('es-AR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
