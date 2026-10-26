using Customers.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;
using Orders.Infrastructure.Persistence;
using SharedKernel.Common;

namespace Api.Stats;

public sealed record SalesTotals(int Orders, long RevenueMinor)
{
    /// <summary>Ticket promedio; 0 si no hubo ventas.</summary>
    public long AverageMinor => Orders > 0 ? RevenueMinor / Orders : 0;
}

public sealed record DailySales(DateOnly Date, long RevenueMinor, int Orders);

public sealed record ChannelTotals(int Orders, long RevenueMinor);

public sealed record SourceSales(string Source, int Orders, long RevenueMinor);

public sealed record ProductSales(string Product, int Units, long RevenueMinor);

public sealed record SalesOverview(
    DateOnly FirstDay, DateOnly LastDay, int Days, string Currency,
    SalesTotals Current, SalesTotals Previous, int NewCustomers, int PreviousNewCustomers,
    IReadOnlyList<DailySales> Series, ChannelTotals Meli,
    IReadOnlyList<SourceSales> BySource, IReadOnlyList<ProductSales> TopProducts);

/// <summary>
/// Las ventas de la visión general (<c>/stats/overview</c>) y del asistente:
/// el período elegido contra el anterior de la misma duración, la serie diaria,
/// el canal de Mercado Libre, el origen del tráfico y lo más vendido. Movida
/// tal cual desde el endpoint; filtra por tienda explícita además del filtro
/// global de EF (fuera de un request el filtro está apagado).
/// </summary>
public sealed class SalesOverviewQuery(OrdersDbContext orders, CustomersDbContext customers, MercadoLibre.Infrastructure.MeliDbContext meli)
{
    public async Task<SalesOverview> RunAsync(TenantId tenant, DateOnly firstDay, DateOnly lastDay, CancellationToken ct)
    {
        var tid = tenant;
        var tidGuid = tid.Value;

        var since = ArgentinaTime.StartOfDayUtc(firstDay);
        var until = ArgentinaTime.StartOfDayUtc(lastDay.AddDays(1));
        var prevSince = since - (until - since);
        var span = lastDay.DayNumber - firstDay.DayNumber + 1;

        var window = await orders.Orders
            .Where(o => o.TenantId == tid && OrderStatuses.Earning.Contains(o.Status)
                && o.PaidAtUtc >= prevSince && o.PaidAtUtc < until)
            .ToListAsync(ct);

        var current = window.Where(o => o.PaidAtUtc >= since).ToList();
        var previous = window.Where(o => o.PaidAtUtc < since).ToList();

        var revenue = current.Sum(o => o.NetRevenue.AmountInMinorUnits);
        var previousRevenue = previous.Sum(o => o.NetRevenue.AmountInMinorUnits);
        var currency = current.FirstOrDefault()?.Currency
            ?? previous.FirstOrDefault()?.Currency
            ?? Money.DefaultCurrency;

        // Clientes que se sumaron a la agenda en el período (y en el anterior).
        var newCustomers = await customers.Customers
            .CountAsync(c => c.TenantId == tidGuid && c.CreatedAtUtc >= since && c.CreatedAtUtc < until, ct);
        var previousNewCustomers = await customers.Customers
            .CountAsync(c => c.TenantId == tidGuid && c.CreatedAtUtc >= prevSince && c.CreatedAtUtc < since, ct);

        // Evolución diaria del período (para el gráfico de barras), en días
        // de Argentina: una venta de las 22 h es de ese día, no del siguiente.
        var byDay = current
            .GroupBy(o => ArgentinaTime.DateOf(o.PaidAtUtc ?? o.CreatedAtUtc))
            .ToDictionary(g => g.Key, g => (Revenue: g.Sum(o => o.NetRevenue.AmountInMinorUnits), Orders: g.Count()));
        var series = Enumerable.Range(0, span)
            .Select(firstDay.AddDays)
            .Select(d => new DailySales(
                d,
                byDay.TryGetValue(d, out var v) ? v.Revenue : 0,
                byDay.TryGetValue(d, out var v2) ? v2.Orders : 0))
            .ToList();

        // De dónde vienen las ventas: canal propio vs. Mercado Libre.
        var meliRevenue = await meli.Orders.AsNoTracking()
            .Where(o => o.TenantId == tidGuid && o.DateCreatedUtc >= since && o.DateCreatedUtc < until
                && MercadoLibre.Infrastructure.MeliOrder.EarningStatuses.Contains(o.Status))
            .ToListAsync(ct);

        // Origen del tráfico que terminó en venta (utm_source de la orden).
        var bySource = current
            .GroupBy(o => string.IsNullOrWhiteSpace(o.UtmSource) ? "directo" : o.UtmSource!)
            .Select(g => new SourceSales(g.Key, g.Count(), g.Sum(o => o.NetRevenue.AmountInMinorUnits)))
            .OrderByDescending(x => x.RevenueMinor)
            .Take(6)
            .ToList();

        // Lo más vendido del período, por facturación.
        var topProducts = current
            .SelectMany(o => o.Items)
            .GroupBy(i => i.ProductName)
            .Select(g => new ProductSales(g.Key, g.Sum(i => i.Quantity), g.Sum(i => i.LineTotal.AmountInMinorUnits)))
            .OrderByDescending(x => x.RevenueMinor)
            .Take(5)
            .ToList();

        return new SalesOverview(
            firstDay, lastDay, span, currency,
            new SalesTotals(current.Count, revenue),
            new SalesTotals(previous.Count, previousRevenue),
            newCustomers, previousNewCustomers,
            series,
            new ChannelTotals(meliRevenue.Count, meliRevenue.Sum(o => (long)Math.Round(o.BillableAmount * 100m))),
            bySource, topProducts);
    }
}
