using Catalog.Infrastructure.Persistence;
using MercadoLibre.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;
using Orders.Infrastructure.Persistence;
using SharedKernel.Common;

namespace Api.Stats;

public sealed record ProfitPrevious(long RevenueMinor, long ProfitMinor, decimal MarginPct);

/// <summary>Un día de la serie; <c>Date</c> es <see cref="StatsRanges.LocalDay"/>.</summary>
public sealed record DailyProfit(DateTime Date, long ProfitMinor, long RevenueMinor);

public sealed record ChannelProfit(string Source, int Orders, long RevenueMinor, long ProfitMinor, int OrdersWithCost);

public sealed record ProductProfit(string Product, int Units, long RevenueMinor, long CostMinor, long ProfitMinor, decimal MarginPct);

public sealed record MeliChannelProfit(
    int Orders, long RevenueMinor, long ProductCostMinor, long MlFeesMinor,
    long GrossProfitMinor, long NetProfitMinor, int UnitsLinked, int UnitsTotal, int UnitsWithFee);

public sealed record Profitability(
    string Currency, long RevenueMinor, long ProductCostMinor, long MpFeesMinor,
    long DiscountsMinor, long ShippingChargedMinor, long ProfitMinor, decimal MarginPct,
    ProfitPrevious Previous, int OrdersWithCost, int OrdersTotal,
    IReadOnlyList<DailyProfit> Series,
    IReadOnlyList<ProductProfit> ByProduct,
    IReadOnlyList<ChannelProfit> ByChannel,
    MeliChannelProfit? Meli);

/// <summary>
/// Rentabilidad REAL de <c>/stats/profitability</c> y del asistente: ganancia =
/// ventas de productos (netas de cupón) − costo snapshot de los ítems −
/// comisión real de MP. El envío cobrado se muestra aparte (pass-through al
/// carrier, no margen). Las órdenes sin costo cargado quedan fuera del margen.
/// <see cref="Profitability.ByProduct"/> trae todos, por ganancia descendente:
/// paginarlos es cosa de quien los muestra. Movida tal cual desde el endpoint;
/// filtra por tienda explícita además del filtro global de EF.
/// </summary>
public sealed class ProfitabilityQuery(OrdersDbContext orders, CatalogDbContext catalog, MeliDbContext meli)
{
    public async Task<Profitability> RunAsync(TenantId tenant, DateTime sinceUtc, DateTime untilUtc, CancellationToken ct)
    {
        var tid = tenant;
        var since = sinceUtc;
        var until = untilUtc;
        var previousSince = since - (until - since);

        var paid = await orders.Orders
            .Where(o => o.TenantId == tid && OrderStatuses.Earning.Contains(o.Status) && o.CreatedAtUtc >= since && o.CreatedAtUtc < until)
            .ToListAsync(ct);

        var currency = paid.FirstOrDefault()?.Currency ?? Money.DefaultCurrency;
        long ItemsNet(Order o) => o.NetRevenue.AmountInMinorUnits - o.ShippingCost.AmountInMinorUnits;

        var withCost = paid.Where(o => o.ProductCost is not null).ToList();
        var revenue = paid.Sum(ItemsNet);
        var revenueWithCost = withCost.Sum(ItemsNet);
        var productCost = withCost.Sum(o => o.ProductCost!.Value.AmountInMinorUnits);
        var mpFees = paid.Sum(o => o.MpFeeAmount?.AmountInMinorUnits ?? 0);
        var mpFeesWithCost = withCost.Sum(o => o.MpFeeAmount?.AmountInMinorUnits ?? 0);
        var discounts = paid.Sum(o => o.DiscountAmount.AmountInMinorUnits);
        var shippingCharged = paid.Sum(o => o.ShippingCost.AmountInMinorUnits);
        var profit = revenueWithCost - productCost - mpFeesWithCost;

        var series = withCost
            .GroupBy(o => StatsRanges.LocalDay(o.PaidAtUtc ?? o.CreatedAtUtc))
            .Select(g => new DailyProfit(
                g.Key,
                g.Sum(o => ItemsNet(o) - o.ProductCost!.Value.AmountInMinorUnits - (o.MpFeeAmount?.AmountInMinorUnits ?? 0)),
                g.Sum(ItemsNet)))
            .OrderBy(x => x.Date).ToList();

        // Por canal de adquisición (utm_source de la sesión del comprador):
        // cierra el triángulo redes/campaña → tráfico → PLATA.
        var byChannel = paid
            .GroupBy(o => o.UtmSource ?? "directo")
            .Select(g =>
            {
                var gWithCost = g.Where(o => o.ProductCost is not null).ToList();
                return new ChannelProfit(
                    g.Key,
                    g.Count(),
                    g.Sum(ItemsNet),
                    gWithCost.Sum(o =>
                        ItemsNet(o) - o.ProductCost!.Value.AmountInMinorUnits - (o.MpFeeAmount?.AmountInMinorUnits ?? 0)),
                    gWithCost.Count);
            })
            .OrderByDescending(x => x.RevenueMinor)
            .ToList();

        // Por producto: solo ítems CON costo (margen honesto, no inventado).
        var byProduct = paid.SelectMany(o => o.Items)
            .Where(i => i.UnitCost is not null)
            .GroupBy(i => i.ProductName)
            .Select(g =>
            {
                var rev = g.Sum(i => i.LineTotal.AmountInMinorUnits);
                var cost = g.Sum(i => i.UnitCost!.Value.AmountInMinorUnits * i.Quantity);
                return new ProductProfit(
                    g.Key,
                    g.Sum(i => i.Quantity),
                    rev,
                    cost,
                    rev - cost,
                    rev > 0 ? Math.Round((rev - cost) * 100m / rev, 1) : 0m);
            })
            .OrderByDescending(x => x.ProfitMinor).ToList();

        var meliProfit = await MeliChannelProfitAsync(tid, since, until, ct);

        // Mismo cálculo sobre el período anterior de igual duración: el
        // margen sin contra qué compararlo no dice si vas mejorando.
        var beforePaid = await orders.Orders
            .Where(o => o.TenantId == tid && OrderStatuses.Earning.Contains(o.Status)
                && o.CreatedAtUtc >= previousSince && o.CreatedAtUtc < since)
            .ToListAsync(ct);
        var beforeWithCost = beforePaid.Where(o => o.ProductCost is not null).ToList();
        var beforeRevenueWithCost = beforeWithCost.Sum(ItemsNet);
        var beforeProfit = beforeRevenueWithCost
            - beforeWithCost.Sum(o => o.ProductCost!.Value.AmountInMinorUnits)
            - beforeWithCost.Sum(o => o.MpFeeAmount?.AmountInMinorUnits ?? 0);

        return new Profitability(
            currency, revenue, productCost, mpFees, discounts, shippingCharged, profit,
            revenueWithCost > 0 ? Math.Round(profit * 100m / revenueWithCost, 1) : 0m,
            new ProfitPrevious(
                beforePaid.Sum(ItemsNet),
                beforeProfit,
                beforeRevenueWithCost > 0 ? Math.Round(beforeProfit * 100m / beforeRevenueWithCost, 1) : 0m),
            withCost.Count, paid.Count,
            series, byProduct, byChannel, meliProfit);
    }

    /// <summary>
    /// Canal Mercado Libre del dashboard de rentabilidad: margen BRUTO (antes
    /// de la comisión de ML, que la API no persiste en el cache local) con el
    /// costo ACTUAL de las variantes vinculadas — no hay snapshot porque la
    /// venta no es nuestra. null = sin ventas ML en el rango.
    /// </summary>
    private async Task<MeliChannelProfit?> MeliChannelProfitAsync(TenantId tid, DateTime since, DateTime until, CancellationToken ct)
    {
        var meliOrders = await meli.Orders.AsNoTracking()
            .Where(o => o.TenantId == tid.Value && MeliOrder.EarningStatuses.Contains(o.Status)
                && o.DateCreatedUtc >= since && o.DateCreatedUtc < until)
            .ToListAsync(ct);
        if (meliOrders.Count == 0) return null;

        var links = await meli.ItemLinks.AsNoTracking()
            .Where(l => l.TenantId == tid.Value).ToListAsync(ct);
        var resolver = MeliLinkResolver.From(links);
        var variantIds = links.Select(l => l.VariantId).Distinct().ToList();
        var costByVariant = variantIds.Count == 0
            ? []
            : (await catalog.Products.AsNoTracking()
                .Where(p => p.TenantId == tid && p.Variants.Any(v => variantIds.Contains(v.Id)))
                .ToListAsync(ct))
                .SelectMany(p => p.Variants)
                .Where(v => v.Cost is not null)
                .ToDictionary(v => v.Id, v => v.Cost!.Value.AmountInMinorUnits);

        long meliRevenue = 0, meliCost = 0, meliFees = 0;
        int unitsLinked = 0, unitsTotal = 0, unitsWithFee = 0;
        foreach (var o in meliOrders)
        {
            // Lo cobrado, no el total de la venta: con una devolución parcial
            // cuenta lo que quedó, igual que en los ingresos del canal.
            meliRevenue += o.BillableMinorUnits;
            foreach (var it in Api.Meli.MeliSyncService.ParseSnapshot(o.ItemsJson))
            {
                unitsTotal += it.Quantity;
                if (it.SaleFee is { } fee)
                {
                    meliFees += (long)Math.Round(fee * it.Quantity * 100m);
                    unitsWithFee += it.Quantity;
                }
                if (resolver.TryResolve(it.ItemId, it.VariationId, out var vid)
                    && costByVariant.TryGetValue(vid, out var unitCost))
                {
                    meliCost += unitCost * it.Quantity;
                    unitsLinked += it.Quantity;
                }
            }
        }
        // Comisión real de ML (sale_fee por ítem). Cero en snapshots viejos sin
        // el campo: unitsWithFee lo delata.
        return new MeliChannelProfit(
            meliOrders.Count, meliRevenue, meliCost, meliFees,
            meliRevenue - meliCost, meliRevenue - meliCost - meliFees,
            unitsLinked, unitsTotal, unitsWithFee);
    }
}
