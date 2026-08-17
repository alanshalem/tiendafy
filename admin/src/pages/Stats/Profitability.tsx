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
import { formatMoney } from '../../lib/format';
import { HelpLink } from '../../components/HelpLink';

interface Profitability {
  currency: string;
  revenue: number;
  productCost: number;
  mpFees: number;
  discounts: number;
  shippingCharged: number;
  profit: number;
  marginPct: number;
  coverage: { ordersWithCost: number; ordersTotal: number };
  series: { date: string; profit: number; revenue: number }[];
  byProduct: {
    product: string;
    units: number;
    revenue: number;
    cost: number;
    profit: number;
    marginPct: number;
  }[];
}

/**
 * Rentabilidad REAL: ganancia = venta de productos (neta de cupón) − costo
 * snapshot − comisión de MP. Vender no es ganar: acá se ve cuánto queda.
 */
export function StatsProfitabilityPage() {
  const { store } = useStore();
  const [range, setRange] = useState(defaultStatsRange());
  const { data, isLoading } = useQuery({
    queryKey: ['stats-profitability', store?.id, range.from, range.to],
    queryFn: () => api.get<Profitability>(`/api/v1/stats/profitability?${rangeQuery(range)}`),
    enabled: !!store,
  });

  const coverage = data?.coverage;
  const partial = coverage && coverage.ordersWithCost < coverage.ordersTotal;

  return (
    <div className="space-y-5">
      <StatsToolbar value={range} onChange={setRange} />
      <StatsPageHeader title="Rentabilidad" />
      <p className="-mt-3 text-sm text-fg-muted">
        Período: {rangeLabel(range)}. Ganancia real = ventas de productos − costo − comisión de Mercado Pago.{' '}
        <HelpLink id="rentabilidad" className="mt-0 w-auto" />
      </p>

      {isLoading || !data ? (
        <div className="grid gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg border border-border bg-surface" />
          ))}
        </div>
      ) : (
        <>
          {partial && (
            <div className="rounded-md border border-warning/25 bg-warning-bg px-4 py-2.5 text-sm text-fg">
              {coverage.ordersWithCost} de {coverage.ordersTotal} ventas del período tienen costo cargado — la
              ganancia se calcula solo sobre esas. Cargá costos en Productos → Costos (o por CSV) para ver el
              número completo.
            </div>
          )}
          {coverage && coverage.ordersWithCost === 0 ? (
            <div className="rounded-lg border border-border bg-surface p-8 text-center text-sm text-fg-muted">
              Todavía no hay ventas con costo cargado. Cargá el costo de tus productos en Productos → Costos
              (o con la columna «Costo» del CSV) y las próximas ventas van a mostrar su ganancia real acá.
            </div>
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-4">
                <KpiCard title="Ganancia real" value={formatMoney(data.profit, data.currency)}>
                  <Sparkline data={data.series.map((s) => s.profit)} />
                </KpiCard>
                <KpiCard title="Margen" value={`${data.marginPct.toLocaleString('es-AR')}%`} />
                <KpiCard title="Costo de productos" value={formatMoney(data.productCost, data.currency)} />
                <KpiCard title="Comisiones MP" value={formatMoney(data.mpFees, data.currency)} />
              </div>

              <ChartCard title="Ganancia por producto" info>
                {data.byProduct.length === 0 ? (
                  <p className="py-4 text-sm text-fg-muted">Sin ventas con costo en el período.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs text-fg-muted">
                          <th className="py-2 font-medium">Producto</th>
                          <th className="py-2 text-right font-medium">Unidades</th>
                          <th className="py-2 text-right font-medium">Facturado</th>
                          <th className="py-2 text-right font-medium">Costo</th>
                          <th className="py-2 text-right font-medium">Ganancia</th>
                          <th className="py-2 text-right font-medium">Margen</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.byProduct.map((p) => (
                          <tr key={p.product} className="border-b border-border last:border-b-0">
                            <td className="py-2 text-fg">{p.product}</td>
                            <td className="py-2 text-right tabular-nums text-fg-muted">{p.units}</td>
                            <td className="py-2 text-right tabular-nums text-fg">
                              {formatMoney(p.revenue, data.currency)}
                            </td>
                            <td className="py-2 text-right tabular-nums text-fg-muted">
                              {formatMoney(p.cost, data.currency)}
                            </td>
                            <td className="py-2 text-right tabular-nums font-medium text-fg">
                              {formatMoney(p.profit, data.currency)}
                            </td>
                            <td
                              className={`py-2 text-right tabular-nums ${p.marginPct < 15 ? 'text-danger' : 'text-fg'}`}
                            >
                              {p.marginPct.toLocaleString('es-AR')}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </ChartCard>

              <p className="text-xs text-fg-muted">
                El envío cobrado ({formatMoney(data.shippingCharged, data.currency)}) no entra en la ganancia:
                se asume que cubre el costo del correo. Los descuentos por cupón (
                {formatMoney(data.discounts, data.currency)}) ya están restados de las ventas.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
