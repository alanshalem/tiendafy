using Catalog.Core.Domain;
using Catalog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;
using Orders.Infrastructure.Persistence;
using SharedKernel.Common;

namespace Api.Stats;

public sealed record TopProducts(
    IReadOnlyList<ProductSales> ByUnits, IReadOnlyList<ProductSales> ByRevenue,
    int TotalUnits, int DistinctProducts, int PublishedProducts,
    IReadOnlyList<string> Idle);

/// <summary>
/// Los productos más vendidos de <c>/stats/products/top</c> y del asistente, y
/// los publicados que no vendieron una sola unidad (<see cref="TopProducts.Idle"/>,
/// todos y ordenados: recortarlos es cosa de quien los muestra). Movida tal cual
/// desde el endpoint; filtra por tienda explícita además del filtro global de EF.
/// </summary>
public sealed class TopProductsQuery(OrdersDbContext orders, CatalogDbContext catalog)
{
    public async Task<TopProducts> RunAsync(TenantId tenant, DateTime sinceUtc, DateTime untilUtc, int take, CancellationToken ct)
    {
        var tid = tenant;

        var paid = await orders.Orders.Where(o => o.TenantId == tid && OrderStatuses.Earning.Contains(o.Status) && o.CreatedAtUtc >= sinceUtc && o.CreatedAtUtc < untilUtc).ToListAsync(ct);
        var lines = paid.SelectMany(o => o.Items).ToList();

        var ranked = lines
            .GroupBy(i => i.ProductName)
            .Select(g => new ProductSales(g.Key, g.Sum(i => i.Quantity), g.Sum(i => i.LineTotal.AmountInMinorUnits)))
            .ToList();

        var top = ranked.OrderByDescending(x => x.Units).Take(take).ToList();
        var topRevenue = ranked.OrderByDescending(x => x.RevenueMinor).Take(take).ToList();

        // Lo que NO se vendió es tan informativo como el top: son los
        // productos publicados que no movieron una sola unidad en el período.
        var sold = ranked.Select(x => x.Product).ToHashSet();
        var published = await catalog.Products
            .Where(p => p.TenantId == tid && p.Status == ProductStatus.Active)
            .Select(p => p.Name)
            .ToListAsync(ct);
        var idle = published.Where(name => !sold.Contains(name)).OrderBy(n => n).ToList();

        return new TopProducts(top, topRevenue, lines.Sum(i => i.Quantity), ranked.Count, published.Count, idle);
    }
}
