import { ExternalLink } from 'lucide-react';
import { KpiCard, StatsPageHeader, StatsToolbar } from '../../components/stats/StatsToolbar';
import { BarChart, ChartCard, DonutChart, HBarChart, Legend, Sparkline } from '../../components/charts';
import { formatArs, formatArsShort, salesMock as m } from '../../lib/statsMock';

export function StatsSalesPage() {
  return (
    <div className="space-y-5">
      <StatsToolbar updatedAt="12/06 · 14:31" />
      <StatsPageHeader title="Ventas y clientes" />

      <div className="grid gap-4 lg:grid-cols-3">
        <KpiCard title="Pedidos creados" value={m.orders.value.toString()}>
          <Sparkline data={m.orders.spark} />
        </KpiCard>
        <KpiCard title="Facturación" value={formatArs(m.revenue.value)}>
          <Sparkline data={m.revenue.spark} />
        </KpiCard>
        <KpiCard title="Ticket promedio" value={formatArs(m.avgTicket.value)}>
          <Sparkline data={m.avgTicket.spark} />
        </KpiCard>
      </div>

      <ChartCard
        title="Pedidos por estado de pago"
        info
        action={<Legend items={[{ label: 'Pago', tint: 1 }, { label: 'Pendiente', tint: 0.45 }]} />}
      >
        <BarChart
          categories={m.byPaymentStatus.categories}
          series={[
            { label: 'Pago', color: 'primary', values: m.byPaymentStatus.paid },
            { label: 'Pendiente', color: 'soft', values: m.byPaymentStatus.pending },
          ]}
        />
      </ChartCard>

      <ChartCard title="Clientes" info>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-fg-muted">
              <th className="py-2 font-medium">Cliente</th>
              <th className="py-2 font-medium">Email</th>
              <th className="py-2 font-medium">Ubicación</th>
              <th className="py-2 text-center font-medium">Pedidos</th>
              <th className="py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {m.customers.map((c) => (
              <tr key={c.email} className="border-b border-border last:border-b-0">
                <td className="py-2.5 font-medium text-fg">{c.name}</td>
                <td className="py-2.5 text-fg-muted">{c.email}</td>
                <td className="py-2.5 text-fg-muted">{c.location}</td>
                <td className="py-2.5 text-center tabular-nums">{c.orders}</td>
                <td className="py-2.5 text-right tabular-nums text-fg">{formatArs(c.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Ingresos por método de pago" info>
          <BarChart
            categories={m.byMethod.categories}
            series={[{ label: 'Ingresos', color: 'primary', values: m.byMethod.values }]}
            formatY={formatArsShort}
          />
        </ChartCard>
        <ChartCard title="Facturación por cuotas" info>
          <DonutChart segments={m.byInstallments} />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Evolución de facturación por cuotas" info>
          <BarChart
            categories={m.installmentsEvolution.categories}
            series={[{ label: 'Facturación', color: 'primary', values: m.installmentsEvolution.values }]}
            formatY={formatArsShort}
          />
        </ChartCard>
        <ChartCard
          title="Ventas con envío pago y gratuito"
          info
          action={<Legend items={[{ label: 'Pago', tint: 1 }, { label: 'Gratis', tint: 0.45 }]} />}
        >
          <BarChart
            categories={m.shipping.categories}
            series={[
              { label: 'Pago', color: 'primary', values: m.shipping.paid },
              { label: 'Gratis', color: 'soft', values: m.shipping.free },
            ]}
          />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Top 5 provincias por facturación" info>
          <HBarChart rows={m.topProvincesRevenue} formatValue={formatArs} />
        </ChartCard>
        <ChartCard title="Top 5 provincias en ventas" info>
          <HBarChart rows={m.topProvincesSales} formatValue={(n) => `${n}`} />
        </ChartCard>
      </div>

      <p className="inline-flex w-full items-center justify-center gap-1 pt-2 text-center text-sm text-primary">Más sobre estadísticas <ExternalLink className="h-3.5 w-3.5" /></p>
    </div>
  );
}
