import { ExternalLink } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { KpiCard, StatsPageHeader, StatsToolbar } from '../../components/stats/StatsToolbar';
import { ChartCard } from '../../components/charts';
import { api } from '../../lib/api';
import { useStore } from '../../context/StoreContext';
import { formatMoney } from '../../lib/format';

interface Overview {
  products: { total: number; published: number; draft: number; archived: number };
  categories: number;
  coupons: { total: number; active: number };
  customers: number;
  pages: { total: number; published: number };
  sales: { available: boolean; orders?: number; revenue?: number; currency?: string };
}

const fmt = (n: number) => n.toLocaleString('es-AR');
const money = formatMoney;

export function StatsOverviewPage() {
  const { store } = useStore();
  const { data, isLoading } = useQuery({
    queryKey: ['stats', store?.id],
    queryFn: () => api.get<Overview>('/api/v1/stats/overview'),
    enabled: !!store,
  });

  return (
    <div className="space-y-5">
      <StatsToolbar />
      <StatsPageHeader title="Visión general" />
      <p className="-mt-3 text-sm text-fg-muted">
        Resumen del catálogo y los clientes de tu tienda.
      </p>

      {isLoading || !data ? (
        <div className="grid gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg border border-border bg-surface shadow-card" />
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
              <div className="text-xs text-fg-subtle">{fmt(data.coupons.active)} de {fmt(data.coupons.total)}</div>
            </KpiCard>
            <KpiCard title="Clientes" value={fmt(data.customers)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <KpiCard title="Páginas" value={fmt(data.pages.total)}>
              <div className="text-xs text-fg-subtle">{fmt(data.pages.published)} publicadas de {fmt(data.pages.total)}</div>
            </KpiCard>

            <ChartCard title="Estadísticas de ventas" info className="lg:col-span-2">
              <div className="flex h-full min-h-[5rem] items-center gap-8">
                <div>
                  <div className="text-sm text-fg-muted">Facturación (pagado)</div>
                  <div className="mt-1 text-2xl font-bold text-fg">{money(data.sales.revenue ?? 0, data.sales.currency ?? 'ARS')}</div>
                </div>
                <div>
                  <div className="text-sm text-fg-muted">Ventas pagadas</div>
                  <div className="mt-1 text-2xl font-bold text-fg">{fmt(data.sales.orders ?? 0)}</div>
                </div>
              </div>
            </ChartCard>
          </div>
        </>
      )}

      <p className="inline-flex w-full items-center justify-center gap-1 pt-2 text-center text-sm text-primary">Más sobre estadísticas <ExternalLink className="h-3.5 w-3.5" /></p>
    </div>
  );
}
