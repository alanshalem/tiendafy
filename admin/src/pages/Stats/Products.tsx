import { useQuery } from '@tanstack/react-query';
import { StatsPageHeader, StatsToolbar } from '../../components/stats/StatsToolbar';
import { ChartCard } from '../../components/charts';
import { api } from '../../lib/api';
import { useStore } from '../../context/StoreContext';
import { formatMoney } from '../../lib/format';

interface TopProducts {
  items: { product: string; units: number; revenue: number }[];
}

const money = formatMoney;

export function StatsProductsPage() {
  const { store } = useStore();
  const { data, isLoading } = useQuery({
    queryKey: ['stats-products', store?.id],
    queryFn: () => api.get<TopProducts>('/api/v1/stats/products/top?days=30&limit=10'),
    enabled: !!store,
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-5">
      <StatsToolbar />
      <StatsPageHeader title="Productos" />
      <p className="-mt-3 text-sm text-fg-muted">Más vendidos en los últimos 30 días (por unidades).</p>

      <ChartCard title="Top productos" info>
        {isLoading ? (
          <p className="py-4 text-sm text-fg-muted">Cargando…</p>
        ) : items.length === 0 ? (
          <p className="py-4 text-sm text-fg-muted">Todavía no hay ventas para rankear productos.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-fg-muted">
                <th className="py-2 font-medium">Producto</th>
                <th className="py-2 text-center font-medium">Unidades</th>
                <th className="py-2 text-right font-medium">Facturación</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p, i) => (
                <tr key={i} className="border-b border-border last:border-b-0">
                  <td className="py-2.5 font-medium text-fg">{p.product}</td>
                  <td className="py-2.5 text-center tabular-nums">{p.units}</td>
                  <td className="py-2.5 text-right tabular-nums text-fg">{money(p.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ChartCard>
    </div>
  );
}
