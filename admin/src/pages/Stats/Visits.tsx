import { ExternalLink } from 'lucide-react';
import { KpiCard, StatsPageHeader, StatsToolbar } from '../../components/stats/StatsToolbar';
import { BarChart, ChartCard, Heatmap, HBarChart, Legend, Sparkline } from '../../components/charts';
import { visitsMock as m } from '../../lib/statsMock';

export function StatsVisitsPage() {
  return (
    <div className="space-y-5">
      <StatsToolbar updatedAt="12/06 · 14:07" />
      <StatsPageHeader title="Visitas" />

      <div className="grid gap-4 lg:grid-cols-3">
        <KpiCard title="Visitas" value={m.total.toLocaleString('es-AR')}>
          <Sparkline data={m.spark} />
        </KpiCard>
        <ChartCard title="Top visitas en catálogo" info className="lg:col-span-2">
          <HBarChart rows={m.topCatalog} formatValue={(n) => `${n}`} />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Recurrencia de visitantes"
          info
          action={<Legend items={[{ label: 'Nuevos', tint: 1 }, { label: 'Recurrentes', tint: 0.45 }]} />}
        >
          <BarChart
            categories={m.recurrence.categories}
            series={[
              { label: 'Nuevos', color: 'primary', values: m.recurrence.nuevos },
              { label: 'Recurrentes', color: 'soft', values: m.recurrence.recurrentes },
            ]}
          />
        </ChartCard>
        <ChartCard
          title="Acceso por dispositivo"
          info
          action={<Legend items={[{ label: 'Mobile', tint: 1 }, { label: 'Desktop', tint: 0.45 }]} />}
        >
          <BarChart
            categories={m.byDevice.categories}
            series={[
              { label: 'Mobile', color: 'primary', values: m.byDevice.mobile },
              { label: 'Desktop', color: 'soft', values: m.byDevice.desktop },
            ]}
          />
        </ChartCard>
      </div>

      <ChartCard title="Visitas por eventos" info>
        <HBarChart rows={m.byEvents} formatValue={(n) => n.toLocaleString('es-AR')} />
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Visitas por UTM origen" info>
          <BarChart
            categories={m.utmSource.categories}
            series={[{ label: 'Origen', color: 'primary', values: m.utmSource.values }]}
          />
        </ChartCard>
        <ChartCard title="Visitas por UTM medio" info>
          <BarChart
            categories={m.utmMedium.categories}
            series={[{ label: 'Medio', color: 'primary', values: m.utmMedium.values }]}
          />
        </ChartCard>
        <ChartCard title="Visitas por UTM campaña" info>
          <BarChart
            categories={m.utmCampaign.categories}
            series={[{ label: 'Campaña', color: 'primary', values: m.utmCampaign.values }]}
          />
        </ChartCard>
      </div>

      <ChartCard title="Visitas por eventos y estados" info>
        <Heatmap
          rows={['Vista home', 'Vista categoría', 'Vista producto', 'Carrito', 'Checkout']}
          cols={14}
          data={[
            m.eventsDistribution,
            m.eventsDistribution.map((v) => Math.round(v * 0.7)),
            m.eventsDistribution.map((v) => Math.round(v * 0.85)),
            m.eventsDistribution.map((v) => Math.round(v * 0.4)),
            m.eventsDistribution.map((v) => Math.round(v * 0.25)),
          ]}
        />
      </ChartCard>

      <p className="inline-flex w-full items-center justify-center gap-1 pt-2 text-center text-sm text-primary">Más sobre estadísticas <ExternalLink className="h-3.5 w-3.5" /></p>
    </div>
  );
}
