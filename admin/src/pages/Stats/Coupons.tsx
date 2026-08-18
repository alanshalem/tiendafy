import { useQuery } from '@tanstack/react-query';
import { KpiCard, StatsPageHeader } from '../../components/stats/StatsToolbar';
import { ChartCard } from '../../components/charts';
import { api } from '../../lib/api';
import { useStore } from '../../context/StoreContext';
import { formatMoney } from '../../lib/format';

interface CouponsReport {
  totalCoupons: number;
  activeCoupons: number;
  totalUses: number;
  totalDiscount: number;
  items: { code: string; uses: number; paidUses: number; discountGiven: number }[];
}

export function StatsCouponsPage() {
  const { store } = useStore();
  const { data, isLoading } = useQuery({
    queryKey: ['stats-coupons', store?.id],
    queryFn: () => api.get<CouponsReport>('/api/v1/stats/coupons'),
    enabled: !!store,
  });

  return (
    <div className="space-y-5">
      {/* Sin filtro de fecha: el reporte de cupones es histórico (uso acumulado). */}
      <StatsPageHeader title="Reporte de cupones" />

      <div className="grid gap-4 lg:grid-cols-4">
        <KpiCard
          title="Cupones"
          hint="Todos los cupones creados, estén activos o no."
          value={(data?.totalCoupons ?? 0).toLocaleString('es-AR')}
        />
        <KpiCard
          title="Activos"
          hint="Vigentes hoy: dentro de fecha y con usos disponibles."
          value={(data?.activeCoupons ?? 0).toLocaleString('es-AR')}
        />
        <KpiCard
          title="Usos"
          hint="Veces que un cupón se aplicó en una venta concretada."
          value={(data?.totalUses ?? 0).toLocaleString('es-AR')}
        />
        <KpiCard
          title="Descuento otorgado"
          hint="La plata que resignaste en descuentos — comparala con la venta que trajo cada cupón (tabla de abajo)."
          value={formatMoney(data?.totalDiscount ?? 0)}
        />
      </div>

      <ChartCard
        title="Uso por cupón"
        info="Usos reales de cada cupón en ventas concretadas, con la plata que movió."
      >
        {isLoading ? (
          <p className="py-4 text-sm text-fg-muted">Cargando…</p>
        ) : !data || data.items.length === 0 ? (
          <p className="py-4 text-sm text-fg-muted">Todavía nadie usó un cupón.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-fg-muted">
                <th className="py-2 font-medium">Código</th>
                <th className="py-2 text-center font-medium">Usos</th>
                <th className="py-2 text-center font-medium">Pagados</th>
                <th className="py-2 text-right font-medium">Descuento</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((c) => (
                <tr key={c.code} className="border-b border-border last:border-b-0">
                  <td className="py-2.5 font-mono text-fg">{c.code}</td>
                  <td className="py-2.5 text-center tabular-nums">{c.uses}</td>
                  <td className="py-2.5 text-center tabular-nums">{c.paidUses}</td>
                  <td className="py-2.5 text-right tabular-nums text-fg">{formatMoney(c.discountGiven)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ChartCard>
    </div>
  );
}
