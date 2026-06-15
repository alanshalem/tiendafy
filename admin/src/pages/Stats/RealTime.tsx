import { useState } from 'react';
import { cn } from '@tiendafy/ui';
import { ExternalLink } from 'lucide-react';
import { StatsPageHeader } from '../../components/stats/StatsToolbar';
import { AreaChart, ChartCard, DonutChart, HBarChart } from '../../components/charts';
import { formatArs, realtimeMock as m } from '../../lib/statsMock';

export function StatsRealTimePage() {
  const [tab, setTab] = useState<'visitors' | 'orders'>('visitors');

  return (
    <div className="space-y-6">
      <StatsPageHeader title="Tiempo real" />

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-fg">Actividad en los últimos 5 minutos</h2>
        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <ChartCard title="Comportamiento de los visitantes" info>
            <HBarChart rows={m.behavior} formatValue={(n) => `${n}`} />
          </ChartCard>
          <ChartCard title="Visitantes activos" info>
            <div className="flex h-full flex-col items-center justify-center py-4">
              <div className="text-5xl font-bold text-primary">{m.activeVisitors}</div>
              <div className="mt-2 flex items-center gap-1.5 text-sm text-fg-muted">
                <span className="h-2 w-2 animate-pulse rounded-full bg-success" /> en la tienda ahora
              </div>
            </div>
          </ChartCard>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-fg">Acumulado de hoy</h2>
        <div className="flex gap-6 border-b border-border text-sm">
          {(['visitors', 'orders'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                '-mb-px border-b-2 pb-2 font-medium',
                tab === t ? 'border-primary text-primary' : 'border-transparent text-fg-muted hover:text-fg',
              )}
            >
              {t === 'visitors' ? 'Visitantes' : 'Pedidos y ventas'}
            </button>
          ))}
        </div>

        {tab === 'visitors' ? (
          <>
            <div className="grid gap-4 lg:grid-cols-[1fr_1.6fr]">
              <ChartCard title="Visitas" info>
                <div className="flex h-full flex-col items-center justify-center py-6">
                  <div className="text-4xl font-bold text-fg">{m.todayVisits}</div>
                  <div className="mt-1 text-sm text-fg-muted">visitas hoy</div>
                </div>
              </ChartCard>
              <ChartCard title="Distribución de accesos" info>
                <AreaChart data={m.accessDistribution} />
              </ChartCard>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title="Recurrencia de visitantes" info>
                <DonutChart segments={m.recurrence} />
              </ChartCard>
              <ChartCard title="Visitantes por origen" info>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-fg-muted">
                      <th className="py-2 font-medium">Origen</th>
                      <th className="py-2 font-medium">Medio</th>
                      <th className="py-2 text-right font-medium">Visitantes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.byOrigin.map((o) => (
                      <tr key={o.origin} className="border-b border-border last:border-b-0">
                        <td className="py-2.5 font-medium text-fg">{o.origin}</td>
                        <td className="py-2.5 text-fg-muted">{o.medium}</td>
                        <td className="py-2.5 text-right tabular-nums">{o.visitors}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ChartCard>
            </div>
          </>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Pedidos de hoy" info>
              <div className="flex h-full flex-col items-center justify-center py-6">
                <div className="text-4xl font-bold text-fg">{m.todayOrders}</div>
                <div className="mt-1 text-sm text-fg-muted">pedidos hoy</div>
              </div>
            </ChartCard>
            <ChartCard title="Facturación de hoy" info>
              <div className="flex h-full flex-col items-center justify-center py-6">
                <div className="text-4xl font-bold text-fg">{formatArs(m.todayRevenue)}</div>
                <div className="mt-1 text-sm text-fg-muted">facturado hoy</div>
              </div>
            </ChartCard>
          </div>
        )}
      </section>

      <p className="inline-flex w-full items-center justify-center gap-1 pt-2 text-center text-sm text-primary">Más sobre estadísticas <ExternalLink className="h-3.5 w-3.5" /></p>
    </div>
  );
}
