import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, cn, Select, Table, useToast } from '@tiendafy/ui';
import {
  KPI_GRID,
  KpiCard,
  StatsPageHeader,
  defaultStatsRange,
  rangeLabel,
  rangeQuery,
} from '../../components/stats/StatsToolbar';
import { useStatsRange } from '../../components/stats/useStatsRange';
import { ChartCard, Sparkline } from '../../components/charts';
import { BarChart, Delta } from '../../components/charts/viz';
import { Pagination } from '../../components/Pagination';
import { api, errMsg } from '../../lib/api';
import { useStore } from '../../context/StoreContext';
import { formatDayShort, formatMoney, formatNumber, formatPercent } from '../../lib/format';
import { HelpLink } from '../../components/HelpLink';
import { CardsSkeleton } from '../../components/Skeleton';

interface Profitability {
  currency: string;
  revenue: number;
  productCost: number;
  mpFees: number;
  discounts: number;
  shippingCharged: number;
  profit: number;
  marginPct: number;
  previous: { revenue: number; profit: number; marginPct: number };
  coverage: { ordersWithCost: number; ordersTotal: number };
  productsTotal: number;
  series: { date: string; profit: number; revenue: number }[];
  byProduct: {
    product: string;
    units: number;
    revenue: number;
    cost: number;
    profit: number;
    marginPct: number;
  }[];
  byChannel: {
    source: string;
    orders: number;
    revenue: number;
    profit: number;
    ordersWithCost: number;
  }[];
  meli: {
    orders: number;
    revenue: number;
    productCost: number;
    mlFees: number;
    grossProfit: number;
    netProfit: number;
    unitsLinked: number;
    unitsTotal: number;
    unitsWithFee: number;
  } | null;
}

interface MetaStatus {
  configured: boolean;
  connected: boolean;
  expired: boolean;
  adAccountId: string | null;
  adAccountName: string | null;
}

interface MetaSpend {
  spendTotal: number;
  campaigns: { id: string; name: string; spend: number }[];
}

/**
 * Rentabilidad REAL: ganancia = venta de productos (neta de cupón) − costo
 * snapshot − comisión de MP. Vender no es ganar: acá se ve cuánto queda.
 */
/** Productos por página en la tabla de ganancia. */
const PAGE_SIZE = 20;

/** A qué período más largo ofrecer pasar cuando el elegido no tuvo ventas. */
const WIDER_PRESETS = [
  { preset: 'Últimos 90 días', label: 'Ver los últimos 90 días' },
  { preset: 'Este año', label: 'Ver todo este año' },
];

export function StatsProfitabilityPage() {
  const { store } = useStore();
  const { range, setRange, page, setPage } = useStatsRange();
  const { data, isLoading } = useQuery({
    queryKey: ['stats-profitability', store?.id, range.from, range.to, page],
    queryFn: () =>
      api.get<Profitability>(
        `/api/v1/stats/profitability?${rangeQuery(range)}&limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}`,
      ),
    enabled: !!store,
    placeholderData: keepPreviousData,
  });
  const totalPages = Math.max(1, Math.ceil((data?.productsTotal ?? 0) / PAGE_SIZE));

  const coverage = data?.coverage;
  // Tres casos distintos que antes eran uno: con el 96 % de los costos
  // cargados pero sin ventas en el período, la pantalla pedía "cargá el costo
  // de tus productos", que ya estaba hecho. Ahora sin ventas sugiere ampliar
  // el período, y el pedido de costos queda para cuando hay ventas sin costo.
  const noSales = !!coverage && coverage.ordersTotal === 0;
  const noCosts = !!coverage && coverage.ordersTotal > 0 && coverage.ordersWithCost === 0;
  const partial = !!coverage && coverage.ordersWithCost > 0 && coverage.ordersWithCost < coverage.ordersTotal;
  // Con "Este año" ya no hay un predefinido más largo que ofrecer.
  const wider =
    range.preset === 'Este año' ? undefined : WIDER_PRESETS.find((w) => w.preset !== range.preset);

  return (
    <div className="space-y-5">
      <StatsPageHeader
        title="Rentabilidad"
        description={
          <>
            Período: {rangeLabel(range)}. Ganancia real = ventas de productos − costo − comisión de Mercado
            Pago. <HelpLink id="rentabilidad" className="mt-0 w-auto" />
          </>
        }
        range={range}
        onRangeChange={setRange}
      />

      {isLoading || !data ? (
        <CardsSkeleton label="Cargando estadísticas…" />
      ) : (
        <>
          {partial && (
            <div className="rounded-md border border-warning/25 bg-warning-bg px-4 py-2.5 text-sm text-fg">
              {coverage.ordersWithCost} de {coverage.ordersTotal} ventas del período tienen costo cargado — la
              ganancia se calcula solo sobre esas.{' '}
              <Link to="/productos/costos" className="font-medium text-primary hover:underline">
                Cargar costos
              </Link>{' '}
              (o por CSV) para ver el número completo.
            </div>
          )}
          {noSales ? (
            <div className="rounded-lg border border-border bg-surface p-8 text-center text-sm text-fg-muted">
              <p>No hubo ventas en el período ({rangeLabel(range)}), así que no hay ganancia para mostrar.</p>
              {wider && (
                <Button
                  variant="secondary"
                  className="mt-3"
                  onClick={() => setRange(defaultStatsRange(wider.preset))}
                >
                  {wider.label}
                </Button>
              )}
            </div>
          ) : noCosts ? (
            <div className="rounded-lg border border-border bg-surface p-8 text-center text-sm text-fg-muted">
              Ninguna de las {formatNumber(coverage.ordersTotal)} ventas del período tiene costo cargado.{' '}
              <Link to="/productos/costos" className="font-medium text-primary hover:underline">
                Cargá el costo de tus productos
              </Link>{' '}
              (o con la columna «Costo» del CSV) y las próximas ventas van a mostrar su ganancia real acá.
            </div>
          ) : (
            <>
              <div className={KPI_GRID}>
                <KpiCard
                  title="Ganancia real"
                  hint="Ventas netas de cupón − costo de lo vendido − comisión real de MP. El envío cobrado va aparte."
                  value={formatMoney(data.profit, data.currency)}
                >
                  <Sparkline data={data.series.map((s) => s.profit)} />
                  <div className="mt-1">
                    <Delta current={data.profit} previous={data.previous.profit} />
                  </div>
                </KpiCard>
                <KpiCard
                  title="Margen"
                  hint="Ganancia ÷ ventas, contando solo las órdenes con costo cargado."
                  value={formatPercent(data.marginPct)}
                >
                  <Delta current={data.marginPct} previous={data.previous.marginPct} />
                </KpiCard>
                <KpiCard
                  title="Costo de productos"
                  hint="El costo del momento de la venta (snapshot), no el de hoy."
                  value={formatMoney(data.productCost, data.currency)}
                />
                <KpiCard
                  title="Comisiones MP"
                  hint="La comisión REAL que cobró Mercado Pago en cada venta, no un promedio."
                  value={formatMoney(data.mpFees, data.currency)}
                />
              </div>

              <ChartCard
                title="Ganancia por canal"
                info="De dónde vino cada venta (el utm_source del link que trajo al comprador): redes, email, ads o directo. La ganancia solo cuenta las órdenes con costo cargado."
              >
                {data.byChannel.length === 0 ? (
                  <p className="py-4 text-sm text-fg-muted">Sin ventas en el período.</p>
                ) : (
                  <Table
                    className="-mx-5"
                    rows={data.byChannel}
                    rowKey={(c) => c.source}
                    columns={[
                      { key: 'source', header: 'Canal', className: 'capitalize' },
                      {
                        key: 'orders',
                        header: 'Ventas',
                        align: 'right',
                        cell: (c) => <span className="tabular-nums text-fg-muted">{c.orders}</span>,
                      },
                      {
                        key: 'revenue',
                        header: 'Facturado',
                        align: 'right',
                        className: 'tabular-nums',
                        cell: (c) => formatMoney(c.revenue, data.currency),
                      },
                      {
                        key: 'profit',
                        header: 'Ganancia',
                        align: 'right',
                        className: 'tabular-nums font-medium',
                        cell: (c) => (c.ordersWithCost > 0 ? formatMoney(c.profit, data.currency) : '—'),
                      },
                    ]}
                  />
                )}
              </ChartCard>

              <ChartCard
                title="Ganancia por producto"
                info="Solo ítems CON costo cargado. Ganancia = facturado − costo; margen en rojo si es menor al 15%."
              >
                {data.byProduct.length === 0 ? (
                  <p className="py-4 text-sm text-fg-muted">Sin ventas con costo en el período.</p>
                ) : (
                  <>
                    <Table
                      className="-mx-5"
                      tableClassName="min-w-[560px]"
                      rows={data.byProduct}
                      rowKey={(p) => p.product}
                      columns={[
                        { key: 'product', header: 'Producto' },
                        {
                          key: 'units',
                          header: 'Unidades',
                          align: 'right',
                          cell: (p) => <span className="tabular-nums text-fg-muted">{p.units}</span>,
                        },
                        {
                          key: 'revenue',
                          header: 'Facturado',
                          align: 'right',
                          className: 'tabular-nums',
                          cell: (p) => formatMoney(p.revenue, data.currency),
                        },
                        {
                          key: 'cost',
                          header: 'Costo',
                          align: 'right',
                          cell: (p) => (
                            <span className="tabular-nums text-fg-muted">
                              {formatMoney(p.cost, data.currency)}
                            </span>
                          ),
                        },
                        {
                          key: 'profit',
                          header: 'Ganancia',
                          align: 'right',
                          className: 'tabular-nums font-medium',
                          cell: (p) => formatMoney(p.profit, data.currency),
                        },
                        {
                          key: 'margin',
                          header: 'Margen',
                          align: 'right',
                          cell: (p) => (
                            <span className={cn('tabular-nums', p.marginPct < 15 && 'text-danger')}>
                              {formatPercent(p.marginPct)}
                            </span>
                          ),
                        },
                      ]}
                    />
                    <Pagination page={Math.min(page, totalPages)} totalPages={totalPages} onPage={setPage} />
                  </>
                )}
              </ChartCard>

              <ChartCard
                title="Ganancia por día"
                info="Cuánto quedó cada día después del costo y las comisiones. Solo cuenta las ventas con costo cargado."
              >
                <BarChart
                  data={data.series.map((s) => ({
                    label: formatDayShort(s.date),
                    value: s.profit,
                    title: `${formatDayShort(s.date)}: ${formatMoney(s.profit, data.currency)} de ganancia`,
                  }))}
                  format={(v) => formatMoney(v, data.currency)}
                />
              </ChartCard>

              <p className="text-xs text-fg-muted">
                El envío cobrado ({formatMoney(data.shippingCharged, data.currency)}) no entra en la ganancia:
                se asume que cubre el costo del correo. Los descuentos por cupón (
                {formatMoney(data.discounts, data.currency)}) ya están restados de las ventas.
              </p>

              {data.meli && (
                <ChartCard
                  title="Canal Mercado Libre"
                  info="Margen del canal ML: costo ACTUAL de las variantes vinculadas + la comisión real de ML (sale_fee) por ítem."
                >
                  <div className="grid gap-4 text-sm sm:grid-cols-4">
                    <div>
                      <div className="text-xs text-fg-muted">Facturado ({data.meli.orders} ventas)</div>
                      <div className="mt-0.5 font-semibold text-fg">
                        {formatMoney(data.meli.revenue, data.currency)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-fg-muted">Costo de productos</div>
                      <div className="mt-0.5 font-semibold text-fg">
                        {formatMoney(data.meli.productCost, data.currency)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-fg-muted">Comisiones ML</div>
                      <div className="mt-0.5 font-semibold text-fg">
                        {data.meli.unitsWithFee > 0
                          ? formatMoney(data.meli.mlFees, data.currency)
                          : 'sin dato'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-fg-muted">
                        {data.meli.unitsWithFee > 0 ? 'Ganancia (neta de ML)' : 'Margen bruto'}
                      </div>
                      <div className="mt-0.5 font-semibold text-fg">
                        {formatMoney(
                          data.meli.unitsWithFee > 0 ? data.meli.netProfit : data.meli.grossProfit,
                          data.currency,
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-fg-muted">
                    Costo con el valor actual de las variantes vinculadas ({data.meli.unitsLinked} de{' '}
                    {data.meli.unitsTotal} unidades con vínculo).
                    {data.meli.unitsWithFee === 0 &&
                      ' La comisión de ML aparece al resincronizar ventas (Configuración → Mercado Libre → Importar últimas ventas).'}
                  </p>
                </ChartCard>
              )}
            </>
          )}
          {/* Fuera de los vacíos a propósito: antes solo aparecía con ventas
              con costo, y conectar Meta quedaba escondido justo al empezar. */}
          <MetaAdsSection profit={data.profit} currency={data.currency} range={range} />
        </>
      )}
    </div>
  );
}

/**
 * Pauta de Meta Ads → ROAS REAL: ganancia (no facturación) / gasto. "Meta te
 * dice ROAS 4x cuando la realidad suele ser 1.8x". Sin credenciales de
 * plataforma la sección lo informa y no molesta.
 */
function MetaAdsSection({
  profit,
  currency,
  range,
}: {
  profit: number;
  currency: string;
  range: ReturnType<typeof defaultStatsRange>;
}) {
  const { store } = useStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: status } = useQuery({
    queryKey: ['meta-status', store?.id],
    queryFn: () => api.get<MetaStatus>('/api/v1/meta-ads/status'),
    enabled: !!store,
  });

  const { data: accounts } = useQuery({
    queryKey: ['meta-accounts', store?.id],
    queryFn: () => api.get<{ items: { id: string; name: string }[] }>('/api/v1/meta-ads/ad-accounts'),
    enabled: !!store && !!status?.connected && !status.expired && !status.adAccountId,
  });

  const { data: spend } = useQuery({
    queryKey: ['meta-spend', store?.id, range.from, range.to],
    queryFn: () => api.get<MetaSpend>(`/api/v1/meta-ads/spend?${rangeQuery(range)}`),
    enabled: !!store && !!status?.connected && !status.expired && !!status.adAccountId,
  });

  const connect = useMutation({
    mutationFn: () => api.post<{ authUrl: string }>('/api/v1/meta-ads/connect', {}),
    onSuccess: (r) => {
      window.location.href = r.authUrl;
    },
    // Sin esto, si Meta o la API rechazaban, el botón no hacía nada y nadie se enteraba.
    onError: (e) => toast(errMsg(e, 'No se pudo conectar con Meta.'), { variant: 'error' }),
  });

  const selectAccount = useMutation({
    mutationFn: (acc: { id: string; name: string }) =>
      api.post('/api/v1/meta-ads/ad-account', { adAccountId: acc.id, name: acc.name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['meta-status', store?.id] }),
    onError: (e) => toast(errMsg(e, 'No se pudo elegir la cuenta publicitaria.'), { variant: 'error' }),
  });

  if (!status) return null;

  if (!status.configured)
    return (
      <p className="text-xs text-fg-muted">
        Pauta de Meta: la conexión con Meta todavía no está habilitada en Tiendafy (la habilita quien
        administra la plataforma). Cuando lo esté, conectá acá tu cuenta de publicidad para ver el ROAS real.
      </p>
    );

  if (!status.connected || status.expired)
    return (
      <ChartCard
        title="Pauta de Meta Ads"
        info="ROAS real = ganancia ÷ gasto de pauta — no facturación ÷ gasto, que es el número que infla Meta."
      >
        <p className="text-sm text-fg-muted">
          {status.expired
            ? 'La conexión con Meta venció (los permisos duran ~60 días). Reconectá para seguir viendo el ROAS real.'
            : 'Conectá tu cuenta de Meta para cruzar el gasto de pauta con la ganancia real y ver el ROAS que importa.'}
        </p>
        <Button className="mt-3" onClick={() => connect.mutate()} loading={connect.isPending}>
          {status.expired ? 'Reconectar Meta' : 'Conectar Meta Ads'}
        </Button>
      </ChartCard>
    );

  if (!status.adAccountId)
    return (
      <ChartCard
        title="Pauta de Meta Ads"
        info="ROAS real = ganancia ÷ gasto de pauta — no facturación ÷ gasto, que es el número que infla Meta."
      >
        <p className="text-sm text-fg-muted">Elegí la cuenta publicitaria de la tienda:</p>
        <div className="mt-2 max-w-sm">
          <Select
            aria-label="Cuenta publicitaria"
            value=""
            placeholder="Cuenta publicitaria…"
            options={(accounts?.items ?? []).map((a) => ({ value: a.id, label: a.name || a.id }))}
            onChange={(e) => {
              const acc = accounts?.items.find((a) => a.id === e.target.value);
              if (acc) selectAccount.mutate(acc);
            }}
          />
        </div>
      </ChartCard>
    );

  const roas = spend && spend.spendTotal > 0 ? profit / spend.spendTotal : null;
  return (
    <ChartCard
      title={`Pauta de Meta Ads · ${status.adAccountName ?? status.adAccountId}`}
      info="ROAS real = ganancia ÷ gasto de pauta — no facturación ÷ gasto, que es el número que infla Meta."
    >
      <div className="grid gap-4 text-sm sm:grid-cols-3">
        <div>
          <div className="text-xs text-fg-muted">Gasto del período</div>
          <div className="mt-0.5 font-semibold text-fg">
            {spend ? formatMoney(spend.spendTotal, currency) : '…'}
          </div>
        </div>
        <div>
          <div className="text-xs text-fg-muted">Ganancia real del período</div>
          <div className="mt-0.5 font-semibold text-fg">{formatMoney(profit, currency)}</div>
        </div>
        <div>
          <div className="text-xs text-fg-muted">ROAS real (ganancia / gasto)</div>
          <div className={`mt-0.5 font-semibold ${roas != null && roas < 1 ? 'text-danger' : 'text-fg'}`}>
            {roas != null
              ? `${formatNumber(roas, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`
              : spend
                ? 'sin gasto'
                : '…'}
          </div>
        </div>
      </div>
      {spend && spend.campaigns.length > 0 && (
        // Con encabezado como el resto: era la única tabla del panel sin nombres de columna.
        <Table
          className="-mx-5 mt-3"
          rows={spend.campaigns}
          rowKey={(c) => c.id}
          columns={[
            { key: 'name', header: 'Campaña' },
            {
              key: 'spend',
              header: 'Gasto',
              align: 'right',
              cell: (c) => (
                <span className="tabular-nums text-fg-muted">{formatMoney(c.spend, currency)}</span>
              ),
            },
          ]}
        />
      )}
    </ChartCard>
  );
}
