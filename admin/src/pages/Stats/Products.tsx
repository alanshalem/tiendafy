import { ExternalLink } from 'lucide-react';
import { StatsPageHeader, StatsToolbar } from '../../components/stats/StatsToolbar';
import { ChartCard, HBarChart } from '../../components/charts';
import { formatArs, productsStatsMock as m } from '../../lib/statsMock';

export function StatsProductsPage() {
  return (
    <div className="space-y-5">
      <StatsToolbar updatedAt="12/06 · 14:39" />
      <StatsPageHeader title="Productos" />

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Productos más vendidos (unidades)" info>
          <HBarChart rows={m.topSold} formatValue={(n) => `${n}`} />
        </ChartCard>
        <ChartCard title="Productos por facturación" info>
          <HBarChart rows={m.topRevenue} formatValue={(n) => formatArs(n)} />
        </ChartCard>
      </div>

      <ChartCard title="Detalle por variante de producto" info>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-fg-muted">
              <th className="py-2 font-medium">Producto</th>
              <th className="py-2 font-medium">Variante</th>
              <th className="py-2 text-center font-medium">Vendidos</th>
              <th className="py-2 text-right font-medium">Facturación</th>
            </tr>
          </thead>
          <tbody>
            {m.variantDetail.map((r, i) => (
              <tr key={i} className="border-b border-border last:border-b-0">
                <td className="py-2.5 font-medium text-fg">{r.name}</td>
                <td className="py-2.5 text-fg-muted">{r.variant}</td>
                <td className="py-2.5 text-center tabular-nums">{r.sold}</td>
                <td className="py-2.5 text-right tabular-nums text-fg">{formatArs(r.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Con stock reservado" info>
          {m.reservedStock.length === 0 ? (
            <EmptyChart />
          ) : (
            <ul className="space-y-2 text-sm">
              {m.reservedStock.map((r, i) => (
                <li key={i} className="flex items-center justify-between border-b border-border pb-2 last:border-b-0">
                  <span className="text-fg">
                    {r.name} <span className="text-fg-muted">· {r.variant}</span>
                  </span>
                  <span className="rounded-full bg-warning-bg px-2 py-0.5 text-xs font-semibold text-warning">
                    {r.reserved} reservado{r.reserved > 1 ? 's' : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
        <ChartCard title="Dispersión de ventas e inventario" info>
          <EmptyChart />
        </ChartCard>
      </div>

      <p className="inline-flex w-full items-center justify-center gap-1 pt-2 text-center text-sm text-primary">Más sobre estadísticas de productos <ExternalLink className="h-3.5 w-3.5" /></p>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-32 flex-col items-center justify-center gap-2 text-fg-subtle">
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-fg-subtle text-xs">i</span>
      <span className="text-sm">Sin resultados por el momento</span>
    </div>
  );
}
