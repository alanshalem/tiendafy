using Catalog.Core.Domain;
using Orders.Infrastructure.Persistence;
using SharedKernel.Common;

namespace Api.Shop;

/// <summary>
/// "Te puede interesar" del carrito. Antes eran siempre los tres primeros
/// productos de la tienda, tuviera lo que tuviera el carrito (y aunque ya
/// estuvieran adentro). Ahora: lo que comparte categoría con lo que se lleva,
/// y si no alcanza, lo más vendido y después lo más nuevo. Siempre con stock
/// y nunca lo que ya está en el carrito.
///
/// <para>
/// Cruza catálogo, ventas (el ranking) y stock: vive en el Api, como
/// <see cref="BestSellers"/>.
/// </para>
/// </summary>
public static class CartSuggestions
{
    public const int MaxLimit = 12;

    /// <summary>Cuántos candidatos de las mismas categorías se ordenan por ventas antes de elegir.</summary>
    private const int CategoryPool = 48;

    public static async Task<IReadOnlyList<Product>> PickAsync(
        IProductRepository products, OrdersDbContext orders, TenantId tenantId,
        IReadOnlyCollection<Guid> cartVariantIds, IReadOnlyCollection<Guid> inStockVariantIds,
        int limit, CancellationToken ct)
    {
        limit = Math.Clamp(limit, 1, MaxLimit);

        var productOf = cartVariantIds.Count > 0
            ? await products.ActiveProductIdsByVariantAsync(tenantId, cartVariantIds, ct)
            : new Dictionary<Guid, Guid>();
        var inCart = productOf.Values.Distinct().ToList();
        var categories = inCart.Count > 0
            ? (await products.ListByIdsAsync(tenantId, inCart, ct)).SelectMany(p => p.CategoryIds).Distinct().ToList()
            : [];

        var ranking = await BestSellers.RankAsync(orders, products, tenantId,
            BestSellers.DefaultDays, BestSellers.ListingDepth, ct);
        var rank = new Dictionary<Guid, int>();
        foreach (var id in ranking) rank.TryAdd(id, rank.Count);
        int RankOf(Product p) => rank.TryGetValue(p.Id, out var r) ? r : int.MaxValue;

        var picked = new List<Product>();
        var seen = new HashSet<Guid>(inCart);
        void Take(IEnumerable<Product> candidates)
        {
            foreach (var p in candidates)
            {
                if (picked.Count >= limit) return;
                if (seen.Add(p.Id)) picked.Add(p);
            }
        }

        // 1. Lo de las mismas categorías, lo que más se vende primero (OrderBy
        //    es estable: entre lo que no está en el ranking sigue lo más nuevo).
        if (categories.Count > 0)
        {
            var related = await products.ListRelatedAsync(tenantId,
                new RelatedProductsQuery(CategoryPool, [.. seen], inStockVariantIds, CategoryIds: categories), ct);
            Take(related.OrderBy(RankOf));
        }

        // 2. Lo más vendido de la tienda.
        if (picked.Count < limit && ranking.Count > 0)
        {
            var top = ranking.Where(id => !seen.Contains(id)).Take(limit * 4).ToList();
            if (top.Count > 0)
            {
                var best = await products.ListRelatedAsync(tenantId,
                    new RelatedProductsQuery(top.Count, [.. seen], inStockVariantIds, Ids: top), ct);
                Take(best.OrderBy(RankOf));
            }
        }

        // 3. Lo más nuevo (una tienda sin ventas todavía).
        if (picked.Count < limit)
            Take(await products.ListRelatedAsync(tenantId,
                new RelatedProductsQuery(limit, [.. seen], inStockVariantIds), ct));

        return picked;
    }
}
