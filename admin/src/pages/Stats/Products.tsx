import { useQuery } from '@tanstack/react-query';
import {
  KpiCard,
  StatsPageHeader,
  StatsToolbar,
  rangeLabel,
  rangeQuery,
} from '../../components/stats/StatsToolbar';
import { useStatsRange } from '../../components/stats/useStatsRange';
import { ChartCard } from '../../components/charts';
import { RankBars } from '../../components/charts/viz';
import { api } from '../../lib/api';
import { useStore } from '../../context/StoreContext';
import { formatMoney, formatNumber } from '../../lib/format';
import { HelpLink } from '../../components/HelpLink';
import { ScreenSkeleton } from '../../components/Skeleton';

interface TopProducts {
  items: { product: string; units: number; revenue: number }[];
  byRevenue: { product: string; units: number; revenue: number }[];
  totalUnits: number;
  distinctProducts: number;
  publishedProducts: number;
  idleCount: number;
  idleSample: string[];
}

const fmt = (n: number) => formatNumber(n);

/**
 * Qué se vende y qué no. La pantalla mostraba una sola tabla de top por
 * unidades; el dato que falta en cualquier catálogo grande es el otro: qué
 * productos publicados no movieron una unidad.
 */
export function StatsProductsPage() {
  const { store } = useStore();
  const { range, setRange } = useStatsRange();
  const { data, isLoading } = useQuery({
    queryKey: ['stats-products', store?.id, range.from, range.to],
    queryFn: () => api.get<TopProducts>(`/api/v1/stats/products/top?limit=10&${rangeQuery(range)}`),
    enabled: !!store,
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-5">
      <StatsToolbar value={range} onChange={setRange} />
      <StatsPageHeader title="Productos" />
      <p className="-mt-3 text-sm text-fg-muted">Qué se vendió y qué no — {rangeLabel(range)}.</p>

      {isLoading ? (
        <ScreenSkeleton label="Cargando estadísticas…" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <KpiCard
              title="Unidades vendidas"
              value={fmt(data?.totalUnits ?? 0)}
              hint="Suma de unidades de todas las ventas cobradas del período."
            />
            <KpiCard
              title="Productos con ventas"
              value={`${fmt(data?.distinctProducts ?? 0)} de ${fmt(data?.publishedProducts ?? 0)}`}
              hint="Cuántos productos distintos se vendieron, sobre el total publicado."
            />
            <KpiCard
              title="Sin vender"
              value={fmt(data?.idleCount ?? 0)}
              hint="Productos publicados que no vendieron ni una unidad en el período: candidatos a mejorar la foto, el precio o darlos de baja."
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Más vendidos (unidades)" info="Ranking por cantidad de unidades vendidas.">
              <RankBars
                rows={items.map((p) => ({
                  label: p.product,
                  value: p.units,
                  display: fmt(p.units),
                  hint: formatMoney(p.revenue),
                }))}
                emptyLabel="Todavía no hay ventas para rankear productos."
              />
            </ChartCard>

            <ChartCard
              title="Los que más facturan"
              info="Ranking por dinero. No siempre coincide con el de unidades: lo que más sale puede no ser lo que más deja."
            >
              <RankBars
                rows={(data?.byRevenue ?? []).map((p) => ({
                  label: p.product,
                  value: p.revenue,
                  display: formatMoney(p.revenue),
                  hint: `${p.units} unidad${p.units === 1 ? '' : 'es'}`,
                }))}
                emptyLabel="Sin ventas en este período."
              />
            </ChartCard>
          </div>

          {(data?.idleCount ?? 0) > 0 && (
            <ChartCard
              title="Publicados que no vendieron nada"
              info="Están a la venta y no movieron una unidad en el período. Se muestran los primeros doce."
            >
              <div className="flex flex-wrap gap-1.5">
                {(data?.idleSample ?? []).map((name) => (
                  <span key={name} className="rounded-full bg-bg-muted px-2.5 py-1 text-xs text-fg-muted">
                    {name}
                  </span>
                ))}
                {(data?.idleCount ?? 0) > (data?.idleSample.length ?? 0) && (
                  <span className="px-2 py-1 text-xs text-fg-subtle">
                    y {fmt((data?.idleCount ?? 0) - (data?.idleSample.length ?? 0))} más
                  </span>
                )}
              </div>
            </ChartCard>
          )}
        </>
      )}

      <HelpLink id="estadisticas" />
    </div>
  );
}
