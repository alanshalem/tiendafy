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
import { ChartCard } from '../../components/charts';
import { Delta, RankBars } from '../../components/charts/viz';
import { Pagination } from '../../components/Pagination';
import { api } from '../../lib/api';
import { useStore } from '../../context/StoreContext';
import { formatMoney, formatNumber } from '../../lib/format';
import { HelpLink } from '../../components/HelpLink';
import { TABLE_HEAD_STICKY, TABLE_SCROLL_X } from '../../lib/styles';

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
  const [range, setRange] = useState(defaultStatsRange('Últimos 90 días'));
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['stats-coupons', store?.id, range.from, range.to, page],
    queryFn: () =>
      api.get<CouponsReport>(
        `/api/v1/stats/coupons?${rangeQuery(range)}&limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}`,
      ),
    enabled: !!store,
  });

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));
  const items = data?.items ?? [];

  return (
    <div className="space-y-5">
      <StatsToolbar
        value={range}
        onChange={(r) => {
          setRange(r);
          setPage(1);
        }}
      />
      <StatsPageHeader title="Reporte de cupones" />
      <p className="-mt-3 text-sm text-fg-muted">Período: {rangeLabel(range)}.</p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
          <p className="py-4 text-sm text-fg-muted">Cargando…</p>
        ) : items.length === 0 ? (
          <p className="py-4 text-sm text-fg-muted">Todavía nadie usó un cupón.</p>
        ) : (
          <>
            <div className={TABLE_SCROLL_X}>
              <table className="w-full min-w-[640px] text-sm">
                <thead className={TABLE_HEAD_STICKY}>
                  <tr className="border-b border-border text-left text-xs text-fg-muted">
                    <th className="py-2 font-medium">Código</th>
                    <th className="py-2 text-center font-medium">Usos</th>
                    <th className="py-2 text-center font-medium">Pagados</th>
                    <th className="py-2 text-right font-medium">Venta</th>
                    <th className="py-2 text-right font-medium">Descuento</th>
                    <th className="py-2 text-right font-medium">Neto</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((c) => (
                    <tr key={c.code} className="border-b border-border last:border-b-0">
                      <td className="py-2.5 font-mono text-fg">{c.code}</td>
                      <td className="py-2.5 text-center tabular-nums">{c.uses}</td>
                      <td className="py-2.5 text-center tabular-nums">{c.paidUses}</td>
                      <td className="py-2.5 text-right tabular-nums text-fg">{formatMoney(c.revenue)}</td>
                      <td className="py-2.5 text-right tabular-nums text-fg-muted">
                        − {formatMoney(c.discountGiven)}
                      </td>
                      <td className="py-2.5 text-right font-medium tabular-nums text-fg">
                        {formatMoney(c.netRevenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={totalPages} onPage={setPage} />
          </>
        )}
      </ChartCard>

      <HelpLink id="cupones" />
    </div>
  );
}
