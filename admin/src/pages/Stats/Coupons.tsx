import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  KPI_GRID,
  KpiCard,
  StatsPageHeader,
  rangeLabel,
  rangeQuery,
} from '../../components/stats/StatsToolbar';
import { useStatsRange } from '../../components/stats/useStatsRange';
import { ChartCard } from '../../components/charts';
import { Delta, RankBars } from '../../components/charts/viz';
import { Pagination } from '../../components/Pagination';
import { api } from '../../lib/api';
import { useStore } from '../../context/StoreContext';
import { formatMoney, formatNumber } from '../../lib/format';
import { HelpLink } from '../../components/HelpLink';
import { Table } from '@tiendafy/ui';
import { TableSkeleton } from '../../components/Skeleton';

interface CouponRow {
  code: string;
  uses: number;
  paidUses: number;
  discountGiven: number;
  revenue: number;
  netRevenue: number;
}

interface CouponsReport {
  totalCoupons: number;
  activeCoupons: number;
  totalUses: number;
  totalDiscount: number;
  totalRevenue: number;
  previous: { totalUses: number; totalDiscount: number; totalRevenue: number };
  total: number;
  items: CouponRow[];
}

/** Cupones por página. */
const PAGE_SIZE = 20;

/**
 * Qué trajo cada cupón, no solo qué regaló. El reporte mostraba el descuento
 * otorgado sin la venta que lo justificaba: con eso no se puede decidir si una
 * promo conviene repetirla.
 */
export function StatsCouponsPage() {
  const { store } = useStore();
  const { range, setRange, page, setPage } = useStatsRange();

  const { data, isLoading } = useQuery({
    queryKey: ['stats-coupons', store?.id, range.from, range.to, page],
    queryFn: () =>
      api.get<CouponsReport>(
        `/api/v1/stats/coupons?${rangeQuery(range)}&limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}`,
      ),
    enabled: !!store,
    placeholderData: keepPreviousData,
  });

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));
  const items = data?.items ?? [];

  return (
    <div className="space-y-5">
      <StatsPageHeader
        title="Reporte de cupones"
        description={`Período: ${rangeLabel(range)}.`}
        range={range}
        onRangeChange={setRange}
      />

      <div className={KPI_GRID}>
        <KpiCard
          title="Venta con cupón"
          hint="Lo que facturaron las ventas cobradas que usaron un cupón. Es lo que hay que mirar contra el descuento."
          value={formatMoney(data?.totalRevenue ?? 0)}
        >
          <Delta current={data?.totalRevenue ?? 0} previous={data?.previous.totalRevenue ?? 0} />
        </KpiCard>
        <KpiCard
          title="Descuento otorgado"
          hint="La plata que resignaste en descuentos durante el período."
          value={formatMoney(data?.totalDiscount ?? 0)}
        >
          <Delta current={data?.totalDiscount ?? 0} previous={data?.previous.totalDiscount ?? 0} />
        </KpiCard>
        <KpiCard
          title="Usos"
          hint="Veces que se aplicó un cupón en una venta del período."
          value={formatNumber(data?.totalUses ?? 0)}
        >
          <Delta current={data?.totalUses ?? 0} previous={data?.previous.totalUses ?? 0} />
        </KpiCard>
        <KpiCard
          title="Cupones activos"
          hint="Vigentes hoy: dentro de fecha y con usos disponibles, sobre el total creado."
          value={`${formatNumber(data?.activeCoupons ?? 0)} de ${formatNumber(data?.totalCoupons ?? 0)}`}
        />
      </div>

      <ChartCard
        title="Los que más venta trajeron"
        info="Ranking por facturación de las ventas que usaron cada cupón."
      >
        <RankBars
          rows={items.slice(0, 6).map((c) => ({
            label: c.code,
            value: c.revenue,
            display: formatMoney(c.revenue),
            hint: `${c.paidUses} venta${c.paidUses === 1 ? '' : 's'} · ${formatMoney(c.discountGiven)} de descuento`,
          }))}
          emptyLabel="Todavía nadie usó un cupón en este período."
        />
      </ChartCard>

      <ChartCard
        title="Detalle por cupón"
        info="Usos, ventas concretadas, descuento otorgado y lo que quedó neto después del descuento."
      >
        {isLoading ? (
          <TableSkeleton rows={4} label="Cargando cupones…" />
        ) : items.length === 0 ? (
          <p className="py-4 text-sm text-fg-muted">Todavía nadie usó un cupón.</p>
        ) : (
          <>
            <Table
              className="-mx-5"
              tableClassName="min-w-[640px]"
              rows={items}
              rowKey={(c) => c.code}
              columns={[
                { key: 'code', header: 'Código', className: 'font-mono' },
                { key: 'uses', header: 'Usos', align: 'center', className: 'tabular-nums' },
                { key: 'paidUses', header: 'Pagados', align: 'center', className: 'tabular-nums' },
                {
                  key: 'revenue',
                  header: 'Venta',
                  align: 'right',
                  className: 'tabular-nums',
                  cell: (c) => formatMoney(c.revenue),
                },
                {
                  key: 'discount',
                  header: 'Descuento',
                  align: 'right',
                  cell: (c) => (
                    <span className="tabular-nums text-fg-muted">− {formatMoney(c.discountGiven)}</span>
                  ),
                },
                {
                  key: 'net',
                  header: 'Neto',
                  align: 'right',
                  className: 'font-medium tabular-nums',
                  cell: (c) => formatMoney(c.netRevenue),
                },
              ]}
            />
            <Pagination page={Math.min(page, totalPages)} totalPages={totalPages} onPage={setPage} />
          </>
        )}
      </ChartCard>

      <HelpLink id="cupones" />
    </div>
  );
}
