import { useQuery } from '@tanstack/react-query';
import { KpiCard, StatsPageHeader } from '../../components/stats/StatsToolbar';
import { ChartCard } from '../../components/charts';
import { BarChart, Delta } from '../../components/charts/viz';
import { formatMoney } from '../../lib/format';
import { api } from '../../lib/api';
import { useStore } from '../../context/StoreContext';

interface RealTime {
  activeVisitors: number;
  views: number;
  recent: { path: string; occurredAtUtc: string }[];
  activePaths: { path: string; visitors: number }[];
  pulse: { minute: string; views: number }[];
  today: { orders: number; revenue: number; currency: string };
  yesterdaySoFar: { orders: number; revenue: number };
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Visitantes activos"
          hint="Personas navegando tu tienda en los últimos 5 minutos."
          value={(data?.activeVisitors ?? 0).toLocaleString('es-AR')}
        />
        <KpiCard
          title="Vistas (5 min)"
          hint="Páginas vistas en los últimos 5 minutos."
          value={(data?.views ?? 0).toLocaleString('es-AR')}
        />
        <KpiCard
          title="Ventas de hoy"
          hint="Ventas cobradas desde las 00:00, comparadas con las que llevabas ayer a esta misma hora."
          value={(data?.today.orders ?? 0).toLocaleString('es-AR')}
        >
          <Delta current={data?.today.orders ?? 0} previous={data?.yesterdaySoFar.orders ?? 0} />
        </KpiCard>
        <KpiCard
          title="Facturado hoy"
          hint="Lo cobrado desde las 00:00 contra lo que llevabas ayer a esta hora: la comparación que sirve cuando el día no terminó."
          value={formatMoney(data?.today.revenue ?? 0, data?.today.currency)}
        >
          <Delta current={data?.today.revenue ?? 0} previous={data?.yesterdaySoFar.revenue ?? 0} />
        </KpiCard>
      </div>

      <ChartCard
        title="Pulso de la última hora"
        info="Vistas minuto a minuto: sirve para ver si la tienda se está despertando o apagando, y el efecto inmediato de una publicación."
      >
        <BarChart
          data={(data?.pulse ?? []).map((m) => ({
            label: m.minute,
            value: m.views,
            title: `${m.minute}: ${m.views} vista${m.views === 1 ? '' : 's'}`,
          }))}
          height={110}
        />
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Páginas activas" info="Qué están mirando los visitantes conectados ahora.">
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

        <ChartCard title="Últimas vistas" info="Las últimas páginas vistas, en vivo (se actualiza solo).">
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
