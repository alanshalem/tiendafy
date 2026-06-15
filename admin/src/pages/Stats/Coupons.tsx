import { ExternalLink } from 'lucide-react';
import { StatsPageHeader } from '../../components/stats/StatsToolbar';
import { ChartCard, HBarChart } from '../../components/charts';
import { couponsMock as m, formatArs } from '../../lib/statsMock';

export function StatsCouponsPage() {
  return (
    <div className="space-y-5">
      <StatsPageHeader title="Cupones utilizados" />

      <ChartCard title="Principales cupones" info>
        <HBarChart rows={m.topCoupons} formatValue={(n) => `${n}`} />
      </ChartCard>

      <ChartCard title="Ventas por cupones" info>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-fg-muted">
              <th className="py-2 font-medium">Cupón</th>
              <th className="py-2 font-medium">Tipo</th>
              <th className="py-2 text-center font-medium">Usos</th>
              <th className="py-2 text-right font-medium">Descuento total</th>
              <th className="py-2 text-right font-medium">Facturación</th>
            </tr>
          </thead>
          <tbody>
            {m.salesByCoupon.map((c) => (
              <tr key={c.code} className="border-b border-border last:border-b-0">
                <td className="py-2.5 font-mono font-medium text-fg">{c.code}</td>
                <td className="py-2.5 text-fg-muted">{c.type}</td>
                <td className="py-2.5 text-center tabular-nums">{c.uses}</td>
                <td className="py-2.5 text-right tabular-nums text-danger">−{formatArs(c.discount)}</td>
                <td className="py-2.5 text-right tabular-nums text-fg">{formatArs(c.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ChartCard>

      <p className="inline-flex w-full items-center justify-center gap-1 pt-2 text-center text-sm text-primary">Más sobre estadísticas <ExternalLink className="h-3.5 w-3.5" /></p>
    </div>
  );
}
