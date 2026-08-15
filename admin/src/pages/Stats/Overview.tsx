import { useQuery } from '@tanstack/react-query';
import { KpiCard, StatsPageHeader } from '../../components/stats/StatsToolbar';
import { ChartCard } from '../../components/charts';
import { api } from '../../lib/api';
import { useStore } from '../../context/StoreContext';
import { formatMoney } from '../../lib/format';
import { HelpLink } from '../../components/HelpLink';

interface Overview {
  products: { total: number; published: number; draft: number; archived: number };
  categories: number;
  coupons: { total: number; active: number };
  customers: number;
  pages: { total: number; published: number };
  sales: { available: boolean; orders?: number; revenue?: number; currency?: string };
}

interface MeliStats {
  connected: boolean;
  orders: number;
  revenue: number;
  currency: string;
  unitsSold: number;
}

const fmt = (n: number) => n.toLocaleString('es-AR');

export function StatsOverviewPage() {
  const { store } = useStore();
  const { data, isLoading } = useQuery({
    queryKey: ['stats', store?.id],
    queryFn: () => api.get<Overview>('/api/v1/stats/overview'),
    enabled: !!store,
  });

  // Multicanal: ventas de Mercado Libre (solo si la tienda conectó su cuenta).
  const { data: meli } = useQuery({
    queryKey: ['stats-meli', store?.id],
    queryFn: () => api.get<MeliStats>('/api/v1/admin/meli/stats?days=30'),
    enabled: !!store,
    retry: false,
  });

  return (
    <div className="space-y-5">
      {/* Sin filtro de fecha: son totales históricos (catálogo/clientes), no un período. */}
      <StatsPageHeader title="Visión general" />
      <p className="-mt-3 text-sm text-fg-muted">Resumen del catálogo y los clientes de tu tienda.</p>

      {isLoading || !data ? (
        <div className="grid gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-lg border border-border bg-surface shadow-card"
            />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-4">
            <KpiCard title="Productos" value={fmt(data.products.total)}>
              <div className="text-xs text-fg-subtle">
                Publicados {fmt(data.products.published)} · Borradores {fmt(data.products.draft)}
              </div>
            </KpiCard>
            <KpiCard title="Categorías" value={fmt(data.categories)} />
            <KpiCard title="Cupones activos" value={fmt(data.coupons.active)}>
              <div className="text-xs text-fg-subtle">
                {fmt(data.coupons.active)} de {fmt(data.coupons.total)}
              </div>
            </KpiCard>
            <KpiCard title="Clientes" value={fmt(data.customers)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <KpiCard title="Páginas" value={fmt(data.pages.total)}>
              <div className="text-xs text-fg-subtle">
                {fmt(data.pages.published)} publicadas de {fmt(data.pages.total)}
              </div>
            </KpiCard>

            <ChartCard title="Estadísticas de ventas" info className="lg:col-span-2">
              <div className="flex h-full min-h-[5rem] items-center gap-8">
                <div>
                  <div className="text-sm text-fg-muted">Facturación (pagado)</div>
                  <div className="mt-1 text-2xl font-bold text-fg">
                    {formatMoney(data.sales.revenue ?? 0, data.sales.currency ?? 'ARS')}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-fg-muted">Ventas pagadas</div>
                  <div className="mt-1 text-2xl font-bold text-fg">{fmt(data.sales.orders ?? 0)}</div>
                </div>
              </div>
            </ChartCard>
          </div>

          {meli?.connected && (
            <ChartCard title="Mercado Libre (últimos 30 días)" info>
              <div className="flex h-full min-h-[5rem] flex-wrap items-center gap-8">
                <div>
                  <div className="text-sm text-fg-muted">Facturado en ML</div>
                  <div className="mt-1 text-2xl font-bold text-fg">
                    {meli.revenue.toLocaleString('es-AR', {
                      style: 'currency',
                      currency: meli.currency || 'ARS',
                      maximumFractionDigits: 0,
                    })}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-fg-muted">Ventas en ML</div>
                  <div className="mt-1 text-2xl font-bold text-fg">{fmt(meli.orders)}</div>
                </div>
                <div>
                  <div className="text-sm text-fg-muted">Unidades vendidas</div>
                  <div className="mt-1 text-2xl font-bold text-fg">{fmt(meli.unitsSold)}</div>
                </div>
              </div>
            </ChartCard>
          )}
        </>
      )}

      <HelpLink id="estadisticas" />
    </div>
  );
}
