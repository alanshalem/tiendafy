using Catalog.Core.Domain;
using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;
using Orders.Infrastructure.Persistence;
using SharedKernel.Common;

namespace Api.Shop;

/// <summary>
/// "Más vendidos" de la tienda: suma las unidades vendidas de cada producto en
/// los últimos N días. Cruza dos módulos —las ventas guardan la variante, la
/// tienda muestra productos—, así que vive en el Api y no en ninguno de los dos.
/// </summary>
public static class BestSellers
{
    public const int DefaultDays = 30;
    public const int MaxDays = 365;

    /// <summary>
    /// Ids de productos publicados, del más vendido al menos, hasta
    /// <paramref name="limit"/>. Vacío si en el período no se vendió nada.
    /// </summary>
    public static async Task<IReadOnlyList<Guid>> RankAsync(
        OrdersDbContext orders, IProductRepository products, TenantId tenantId,
        int days, int limit, CancellationToken ct)
    {
        var since = DateTime.UtcNow.AddDays(-Math.Clamp(days, 1, MaxDays));

        // Ventas que cuentan como venta (cobradas, despachadas o con un
        // reembolso parcial): lo mismo que miran las estadísticas del panel.
        // Agrupado en la base: vuelve una fila por variante, no las órdenes.
        var soldByVariant = await orders.Orders.AsNoTracking()
            .Where(o => o.TenantId == tenantId
                && OrderStatuses.Earning.Contains(o.Status)
                && o.PaidAtUtc >= since)
            .SelectMany(o => o.Items)
            .GroupBy(i => i.VariantId)
            .Select(g => new { VariantId = g.Key, Units = g.Sum(i => i.Quantity) })
            .ToListAsync(ct);
        if (soldByVariant.Count == 0) return [];

        // Una variante de un producto que ya no se publica no vuelve: lo que
        // vendió no lo sube a una sección donde no se puede comprar.
        var productOf = await products.ActiveProductIdsByVariantAsync(
            tenantId, [.. soldByVariant.Select(s => s.VariantId)], ct);

        return
        [
            .. soldByVariant
                .Where(s => productOf.ContainsKey(s.VariantId))
                .GroupBy(s => productOf[s.VariantId])
                .Select(g => (ProductId: g.Key, Units: g.Sum(s => s.Units)))
                .OrderByDescending(x => x.Units)
                .ThenBy(x => x.ProductId) // estable entre pedidos: la caché de la tienda no salta
                .Take(limit)
                .Select(x => x.ProductId),
        ];
    }
}
