using Api.Shop;
using Catalog.Core;
using Catalog.Core.Domain;
using Orders.Infrastructure.Persistence;
using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace Api.Endpoints;

public static partial class ProductEndpoints
{
    /// <summary>Tope de productos por sección: más que eso ya no es una vidriera, es el catálogo.</summary>
    public const int SectionMaxLimit = 24;
    private const int SectionDefaultLimit = 8;

    /// <summary>
    /// Storefront: los productos de una sección de la portada según de dónde
    /// salen (elegidos a mano, una categoría, una marca, lo último, las ofertas
    /// o lo más vendido). Público como el resto de las lecturas del catálogo y
    /// con el mismo DTO que la búsqueda: nada interno (ni costo) sale de acá.
    ///
    /// Antes la tienda armaba estas listas con los 24 productos más nuevos que
    /// ya tenía: destacados y recién llegados mostraban lo mismo, ofertas solo
    /// encontraba las de esos 24, y lo elegido a mano se pedía de a uno y se
    /// mostraba aunque estuviera en borrador o archivado.
    /// </summary>
    private static void MapSection(RouteGroupBuilder products)
    {
        products.MapGet("/section", async (
            ITenantContext tenant,
            IProductRepository repository,
            OrdersDbContext ordersDb,
            Inventory.Core.Domain.IStockRepository stockRepository,
            global::Reviews.Infrastructure.ReviewsDbContext reviewsDb,
            CancellationToken ct,
            string? kind = null,
            string? ids = null,
            Guid? categoryId = null,
            bool? includeChildren = null,
            string? brand = null,
            string? sort = null,
            int? days = null,
            int? limit = null) =>
        {
            var take = Math.Clamp(limit ?? SectionDefaultLimit, 1, SectionMaxLimit);
            var order = ParseSectionSort(sort);

            SectionProductQuery query;
            switch (kind?.Trim().ToLowerInvariant())
            {
                case "manual":
                    query = new SectionProductQuery(SectionProductKind.Manual, take, Ids: ParseIds(ids));
                    break;
                case "category":
                    if (categoryId is null)
                        return Error.Validation("Section.CategoryRequired", "Elegí una categoría.").ToProblem();
                    query = new SectionProductQuery(SectionProductKind.Category, take,
                        CategoryId: categoryId, IncludeChildren: includeChildren ?? true, Sort: order);
                    break;
                case "brand":
                    if (string.IsNullOrWhiteSpace(brand))
                        return Error.Validation("Section.BrandRequired", "Elegí una marca.").ToProblem();
                    query = new SectionProductQuery(SectionProductKind.Brand, take, Brand: brand, Sort: order);
                    break;
                case "newest":
                    query = new SectionProductQuery(SectionProductKind.Newest, take);
                    break;
                case "on-sale":
                    query = new SectionProductQuery(SectionProductKind.OnSale, take, Sort: order);
                    break;
                case "best-sellers":
                    // Cruza ventas y catálogo: el ranking lo arma el Api y el
                    // catálogo trae esos ids como una lista elegida.
                    var ranked = await BestSellers.RankAsync(ordersDb, repository, tenant.TenantId,
                        days ?? BestSellers.DefaultDays, take, ct);
                    query = new SectionProductQuery(SectionProductKind.Manual, take, Ids: ranked);
                    break;
                default:
                    return Error.Validation("Section.InvalidKind",
                        "El origen tiene que ser manual, category, brand, newest, on-sale o best-sellers.").ToProblem();
            }

            var items = await repository.ListForSectionAsync(tenant.TenantId, query, ct);

            // Stock por producto (suma de variantes), como la búsqueda: la card
            // muestra "Sin stock" o "¡Últimas N!" y no deja agregar lo agotado.
            var variantIds = items.SelectMany(p => p.Variants.Select(v => v.Id)).ToList();
            var stockByVariant = variantIds.Count > 0
                ? (await stockRepository.GetByVariantsAsync(tenant.TenantId, variantIds, ct))
                    .ToDictionary(s => s.VariantId, s => s.Available)
                : new Dictionary<Guid, int>();

            var ratings = await Api.Reviews.ProductRatings.ForAsync(reviewsDb, tenant.TenantId.Value, items.Select(p => p.Id).ToList(), ct);

            return Results.Ok(new
            {
                items = items.Select(p => p.ToDto() with
                {
                    Stock = p.Variants.Sum(v => stockByVariant.GetValueOrDefault(v.Id)),
                    Rating = ratings.GetValueOrDefault(p.Id),
                }),
            });
        });
    }

    /// <summary>Ids separados por coma; lo que no es un GUID se ignora. Hasta 100, como el resto de los listados por id.</summary>
    private static List<Guid> ParseIds(string? raw) =>
        [.. (raw ?? string.Empty)
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(x => Guid.TryParse(x, out var g) ? g : Guid.Empty)
            .Where(g => g != Guid.Empty)
            .Distinct()
            .Take(100)];

    /// <summary>Los mismos valores que el orden de la búsqueda del storefront; sin valor, lo más nuevo primero.</summary>
    private static ProductSort ParseSectionSort(string? sort) => sort?.ToLowerInvariant() switch
    {
        "price_asc" => ProductSort.PriceAsc,
        "price_desc" => ProductSort.PriceDesc,
        "name" or "name_asc" => ProductSort.NameAsc,
        _ => ProductSort.Newest,
    };
}
