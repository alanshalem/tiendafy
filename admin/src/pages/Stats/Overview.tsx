import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  KpiCard,
  StatsPageHeader,
  StatsToolbar,
  defaultStatsRange,
} from '../../components/stats/StatsToolbar';
import { ChartCard } from '../../components/charts';
import { BarChart, DonutChart, Delta, RankBars } from '../../components/charts/viz';
import { api } from '../../lib/api';
import { useStore } from '../../context/StoreContext';
import { formatDayShort, formatMoney, formatNumber } from '../../lib/format';
import { HelpLink } from '../../components/HelpLink';

interface Overview {
  days: number;
  currency: string;
  products: { total: number; published: number; draft: number; archived: number };
  categories: number;
  coupons: { total: number; active: number };
  customers: number;
  pages: { total: number; published: number };
  sales: {
    available: boolean;
    orders: number;
    revenue: number;
    averageOrder: number;
    previous: { orders: number; revenue: number; averageOrder: number };
  };
  series: { date: string; revenue: number; orders: number }[];
  channels: { own: { orders: number; revenue: number }; meli: { orders: number; revenue: number } };
  bySource: { source: string; orders: number; revenue: number }[];
  topProducts: { product: string; units: number; revenue: number }[];
}

const fmt = (n: number) => formatNumber(n);

const SOURCE_LABEL: Record<string, string> = {
  directo: 'Directo / sin origen',
  redes: 'Redes sociales',
  email: 'Email marketing',
  meli: 'Mercado Libre',
};

/**
 * Tablero de la tienda: cómo viene el negocio en el período elegido y contra el
 * anterior. Antes esta pantalla era una fila de contadores del catálogo
 * (productos, categorías, páginas) y un total histórico de facturación: nada
 * que responda "¿cómo vengo este mes?".
 */
export function StatsOverviewPage() {
  const { store } = useStore();
  const [range, setRange] = useState(defaultStatsRange());
  const days = Math.max(
    1,
    Math.round((new Date(range.to).getTime() - new Date(range.from).getTime()) / 86_400_000) + 1,
  );

  const { data, isLoading } = useQuery({
    queryKey: ['stats', store?.id, days],
    queryFn: () => api.get<Overview>(`/api/v1/stats/overview?days=${days}`),
    enabled: !!store,
  });

  const sales = data?.sales;
  const currency = data?.currency ?? 'ARS';
  const money = (v: number) => formatMoney(v, currency);

  return (
    <div className="space-y-5">
      <div>
        <StatsPageHeader title="Visión general" />
        <p className="mt-1 text-sm text-fg-muted">
          Cómo viene tu negocio, comparado con el período anterior.
        </p>
      </div>

      <StatsToolbar value={range} onChange={setRange} />

      {isLoading || !data ? (
        <p className="py-16 text-center text-sm text-fg-muted">Cargando…</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              title="Facturación"
              value={money(sales?.revenue ?? 0)}
              hint="Suma de las ventas cobradas en el período (sin las que están esperando pago)."
            >
              <Delta current={sales?.revenue ?? 0} previous={sales?.previous.revenue ?? 0} />
            </KpiCard>
            <KpiCard
              title="Ventas cobradas"
              value={fmt(sales?.orders ?? 0)}
              hint="Cantidad de ventas pagadas."
            >
              <Delta current={sales?.orders ?? 0} previous={sales?.previous.orders ?? 0} />
            </KpiCard>
            <KpiCard
              title="Ticket promedio"
              value={money(sales?.averageOrder ?? 0)}
              hint="Facturación dividida por la cantidad de ventas: cuánto gasta en promedio quien te compra."
            >
              <Delta current={sales?.averageOrder ?? 0} previous={sales?.previous.averageOrder ?? 0} />
            </KpiCard>
            <KpiCard
              title="Clientes"
              value={fmt(data.customers)}
              hint="Fichas en tu agenda: una por comprador, más los que cargaste a mano."
            >
              <Link to="/clientes" className="text-xs font-medium text-primary hover:underline">
                Ver clientes
              </Link>
            </KpiCard>
          </div>

          <ChartCard
            title="Facturación por día"
            info="Cada barra es un día del período. La barra más alta queda marcada con su fecha."
          >
            <BarChart
              data={data.series.map((s) => ({
                label: formatDayShort(s.date),
                value: s.revenue,
                title: `${formatDayShort(s.date)}: ${money(s.revenue)} · ${s.orders} venta${s.orders === 1 ? '' : 's'}`,
              }))}
              format={money}
            />
          </ChartCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              title="Por dónde vendés"
              info="Participación de cada canal en la facturación del período: tu tienda y Mercado Libre."
            >
              <DonutChart
                slices={[
                  { label: 'Tienda online', value: data.channels.own.revenue },
                  { label: 'Mercado Libre', value: data.channels.meli.revenue },
                ]}
                centerLabel="facturado"
                centerValue={money(data.channels.own.revenue + data.channels.meli.revenue)}
              />
            </ChartCard>

            <ChartCard
              title="De dónde llegan tus ventas"
              info="Origen de cada venta de tu tienda: se guarda al comprar, desde el link por el que entró (redes, campañas de email o directo)."
            >
              <RankBars
                rows={data.bySource.map((s) => ({
                  label: SOURCE_LABEL[s.source] ?? s.source,
                  value: s.revenue,
                  display: money(s.revenue),
                  hint: `${s.orders} venta${s.orders === 1 ? '' : 's'}`,
                }))}
                emptyLabel="Todavía no hay ventas con origen registrado."
              />
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              title="Lo más vendido"
              info="Los cinco productos que más facturaron en el período."
              action={
                <Link
                  to="/estadisticas/productos"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Ver todos
                </Link>
              }
            >
              <RankBars
                rows={data.topProducts.map((p) => ({
                  label: p.product,
                  value: p.revenue,
                  display: money(p.revenue),
                  hint: `${p.units} unidad${p.units === 1 ? '' : 'es'}`,
                }))}
                emptyLabel="Sin ventas en este período."
              />
            </ChartCard>

            <ChartCard
              title="Tu tienda hoy"
              info="El estado del catálogo y del contenido, sin importar el período."
            >
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <CatalogRow label="Productos publicados" value={fmt(data.products.published)} />
                <CatalogRow label="Borradores" value={fmt(data.products.draft)} />
                <CatalogRow label="Categorías" value={fmt(data.categories)} />
                <CatalogRow
                  label="Cupones activos"
                  value={`${fmt(data.coupons.active)} de ${fmt(data.coupons.total)}`}
                />
                <CatalogRow
                  label="Páginas publicadas"
                  value={`${fmt(data.pages.published)} de ${fmt(data.pages.total)}`}
                />
                <CatalogRow label="Archivados" value={fmt(data.products.archived)} />
              </dl>
            </ChartCard>
          </div>
        </>
      )}

      <HelpLink id="estadisticas" />
    </div>
  );
}

function CatalogRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-fg-muted">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold text-fg">{value}</dd>
    </div>
  );
}
