using Api.Shop;
using Catalog.Contracts;
using Catalog.Core;
using Catalog.Core.Domain;
using Catalog.Core.Features.CreateCategory;
using Orders.Infrastructure.Persistence;
using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace Api.Endpoints;

public static partial class ProductEndpoints
{
    /// <summary>Menos que esto no se busca: con una letra aparece medio catálogo.</summary>
    public const int SuggestMinLength = 2;

    /// <summary>
    /// Storefront: lo que ayuda a encontrar un producto fuera del listado. El
    /// buscador predictivo del encabezado y las sugerencias del carrito.
    /// Públicos, con el mismo DTO que la búsqueda.
    /// </summary>
    private static void MapShopFinders(RouteGroupBuilder products)
    {
        // Mientras se escribe: los primeros productos (con foto, precio y
        // stock), cuántos hay en total y las categorías que se llaman así. Sin
        // facetas ni paginado: la búsqueda entera es otra cosa y pesa más.
        products.MapGet("/suggest", async (
            ITenantContext tenant,
            IProductRepository repository,
            Inventory.Core.Domain.IStockRepository stockRepository,
            global::Reviews.Infrastructure.ReviewsDbContext reviewsDb,
            CancellationToken ct,
            string? q = null,
            int limit = 6) =>
        {
            var text = (q ?? string.Empty).Trim();
            if (text.Length < SuggestMinLength)
                return Results.Ok(new { items = Array.Empty<ProductDto>(), total = 0, categories = Array.Empty<CategoryDto>() });

            var inStock = await stockRepository.ListInStockVariantIdsAsync(tenant.TenantId, ct);
            var found = await repository.SuggestAsync(tenant.TenantId, text, inStock, limit, ct);
            return Results.Ok(new
            {
                items = await ForCardsAsync(found.Products, stockRepository, reviewsDb, tenant.TenantId, ct),
                total = found.Total,
                categories = found.Categories.Select(c => c.ToDto()),
            });
        });

        // "Te puede interesar" del carrito: según lo que tiene adentro (ver
        // CartSuggestions). Sin variantes, lo más vendido.
        products.MapGet("/cart-suggestions", async (
            ITenantContext tenant,
            IProductRepository repository,
            Inventory.Core.Domain.IStockRepository stockRepository,
            OrdersDbContext ordersDb,
            global::Reviews.Infrastructure.ReviewsDbContext reviewsDb,
            CancellationToken ct,
            string? variants = null,
            int limit = 3) =>
        {
            var inStock = await stockRepository.ListInStockVariantIdsAsync(tenant.TenantId, ct);
            var picked = await CartSuggestions.PickAsync(repository, ordersDb, tenant.TenantId,
                ParseIds(variants), inStock, limit, ct);
            return Results.Ok(new { items = await ForCardsAsync(picked, stockRepository, reviewsDb, tenant.TenantId, ct) });
        });
    }

    /// <summary>
    /// El DTO de la tienda, con lo que muestra la card: el stock del producto
    /// (suma de sus variantes) y las estrellas de sus reseñas.
    /// </summary>
    private static async Task<List<ProductDto>> ForCardsAsync(
        IReadOnlyList<Product> items, Inventory.Core.Domain.IStockRepository stockRepository,
        global::Reviews.Infrastructure.ReviewsDbContext reviewsDb, TenantId tenantId, CancellationToken ct)
    {
        var variantIds = items.SelectMany(p => p.Variants.Select(v => v.Id)).ToList();
        var stockByVariant = variantIds.Count > 0
            ? (await stockRepository.GetByVariantsAsync(tenantId, variantIds, ct)).ToDictionary(s => s.VariantId, s => s.Available)
            : new Dictionary<Guid, int>();
        var ratings = await Api.Reviews.ProductRatings.ForAsync(reviewsDb, tenantId.Value, items.Select(p => p.Id).ToList(), ct);
        return
        [
            .. items.Select(p => p.ToDto() with
            {
                Stock = p.Variants.Sum(v => stockByVariant.GetValueOrDefault(v.Id)),
                Rating = ratings.GetValueOrDefault(p.Id),
            }),
        ];
    }
}
