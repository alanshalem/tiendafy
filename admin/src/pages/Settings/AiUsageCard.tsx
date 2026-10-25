import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Select, Spinner } from '@tiendafy/ui';
import { api } from '../../lib/api';
import { formatUsd, type AiTaskOptions, type AiUsage, type AiUsageScope } from '../../lib/ai';
import { qk } from '../../lib/queryKeys';
import { formatDayShort, formatPercent } from '../../lib/format';
import { useStore } from '../../context/StoreContext';
import { ChartCard } from '../../components/charts';
import { BarChart, RankBars } from '../../components/charts/viz';
import { KpiCard, KPI_GRID } from '../../components/stats/StatsToolbar';
import { ERROR_SHOWN, LoadError } from '../../components/LoadError';

/** El consumo del mes de esta tienda, o la suma de todas las que son tuyas. */
export function useAiUsage(scope: AiUsageScope, enabled = true) {
  const { store } = useStore();
  return useQuery({
    queryKey: qk.aiUsage(store?.id, scope),
    queryFn: () => api.get<AiUsage>(`/api/v1/ai/config/usage?scope=${scope}`),
    enabled: !!store && enabled,
    meta: ERROR_SHOWN,
  });
}

export function AiUsageCard({ tasks }: { tasks: AiTaskOptions[] }) {
  const [scope, setScope] = useState<AiUsageScope>('store');
  const usage = useAiUsage(scope);
  const data = usage.data;
  const taskLabel = (key: string) => tasks.find((t) => t.task === key)?.label ?? key;

  return (
    <section className="space-y-4" aria-labelledby="ai-usage-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="ai-usage-title" className="text-base font-semibold text-fg">
          Consumo del mes
        </h2>
        <div className="w-48">
          <Select
            aria-label="Alcance del consumo"
            value={scope}
            onChange={(e) => setScope(e.target.value as AiUsageScope)}
            options={[
              { value: 'store', label: 'Esta tienda' },
              { value: 'owned', label: 'Todas mis tiendas' },
            ]}
          />
        </div>
      </div>

      {usage.error && !data ? (
        <LoadError
          title="No se pudo cargar el consumo."
          error={usage.error}
          onRetry={() => void usage.refetch()}
          retrying={usage.isFetching}
        />
      ) : !data ? (
        <p className="flex items-center gap-2 text-sm text-fg-muted">
          <Spinner inline /> Cargando…
        </p>
      ) : (
        <>
          <div className={KPI_GRID}>
            <KpiCard
              title="Gastado este mes"
              value={formatUsd(data.spentMicroUsd)}
              hint="Estimado a partir de lo que consumió cada tarea. La factura real es la de cada proveedor."
            >
              <Budget spent={data.spentMicroUsd} budget={data.budgetMicroUsd} />
            </KpiCard>
          </div>

          <ChartCard title="Por día" info="Lo gastado cada día del mes, en dólares.">
            <BarChart
              data={data.byDay.map((d) => ({
                label: formatDayShort(d.day),
                value: d.microUsd,
                title: `${formatDayShort(d.day)}: ${formatUsd(d.microUsd)}`,
              }))}
              format={formatUsd}
            />
          </ChartCard>

          <div className="grid gap-4 lg:grid-cols-2">
            {data.stores && (
              <ChartCard title="Por tienda" className="lg:col-span-2">
                <RankBars
                  rows={data.stores.map((s) => ({
                    label: s.name,
                    value: s.spentMicroUsd,
                    display: formatUsd(s.spentMicroUsd),
                    hint: s.budgetMicroUsd > 0 ? `Tope ${formatUsd(s.budgetMicroUsd)}` : 'Sin tope',
                  }))}
                />
              </ChartCard>
            )}
            <ChartCard title="Por tarea">
              <RankBars
                emptyLabel="Todavía no se usó la inteligencia artificial este mes."
                rows={data.byTask.map((r) => ({
                  label: taskLabel(r.key),
                  value: r.microUsd,
                  display: formatUsd(r.microUsd),
                }))}
              />
            </ChartCard>
            <ChartCard title="Por modelo">
              <RankBars
                emptyLabel="Todavía no se usó la inteligencia artificial este mes."
                rows={data.byModel.map((r) => ({
                  label: r.key,
                  value: r.microUsd,
                  display: formatUsd(r.microUsd),
                }))}
              />
            </ChartCard>
            <ChartCard title="Por persona" className="lg:col-span-2">
              <RankBars
                emptyLabel="Todavía no se usó la inteligencia artificial este mes."
                rows={data.byUser.map((r) => ({
                  label: r.name,
                  value: r.microUsd,
                  display: formatUsd(r.microUsd),
                }))}
              />
            </ChartCard>
          </div>

          <p className="text-xs text-fg-subtle">
            Estimado. La factura real es la de cada proveedor; poné también un límite en su consola.
          </p>
        </>
      )}
    </section>
  );
}

/** Gastado contra el tope. Sin tope cargado (cero) no hay barra ni porcentaje: se dice que no hay. */
function Budget({ spent, budget }: { spent: number; budget: number }) {
  if (budget <= 0) return <p className="text-sm text-fg-muted">Sin tope</p>;
  const pct = (spent / budget) * 100;
  const shown = Math.min(100, pct);
  return (
    <>
      <p className="text-sm text-fg-muted">
        de un tope de {formatUsd(budget)} ({formatPercent(Math.floor(pct), 0)})
      </p>
      <div
        role="progressbar"
        aria-label="Tope usado"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.floor(shown)}
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-bg-muted"
      >
        <div
          className={`h-full rounded-full ${pct >= 100 ? 'bg-danger' : 'bg-primary'}`}
          style={{ width: `${shown}%` }}
        />
      </div>
    </>
  );
}
