using Api.Auth;
using Api.Import;
using Catalog.Core.Domain;
using Catalog.Core.Features.UpdateProduct;
using Identity.Infrastructure;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace Api.Endpoints;

public static partial class ProductEndpoints
{
    /// <summary>
    /// Precios y costos: la repreciacion masiva y el costo por variante. El
    /// costo es dato interno del comercio y NUNCA viaja en los DTOs publicos
    /// del catalogo, asi que todo este bloque exige permiso explicito.
    /// </summary>
    private static void MapPricing(RouteGroupBuilder products)
    {

        // ---- Repreciación masiva ----
        // Llegó el contenedor con dólar nuevo: +X% a todo (o a una categoría)
        // con redondeo comercial, en un click — no variante por variante.
        products.MapPost("/reprice", async (
            RepriceRequest request, ITenantContext tenant,
            IProductRepository repository, UpdateProductHandler handler, CancellationToken ct) =>
        {
            var all = await ProductImportEndpointHelpers.LoadAllProductsAsync(repository, tenant.TenantId, ct);
            var targets = all
                .Where(p => p.Status != ProductStatus.Archived)
                .Where(p => request.CategoryId is not { } cat || p.CategoryIds.Contains(cat))
                .Select(p => p.Id)
                .ToList();
            if (targets.Count == 0)
                return Error.Validation("Product.NoTargets", "No hay productos que repreciar con ese filtro.").ToProblem();

            var result = await handler.RepriceAsync(
                new RepriceCommand(tenant.TenantId, targets, request.Percent, request.Rounding ?? "none"), ct);
            return result.IsSuccess
                ? Results.Ok(new { products = result.Value.Products, variants = result.Value.Variants })
                : result.Error.ToProblem();
        });

        // ---- Costos por variante (rentabilidad) ----
        // Dato interno del merchant: NUNCA viaja en los DTOs públicos del catálogo.
        // Lectura y escritura exigen permiso de catálogo explícito (no ForWrites:
        // los GET del grupo son públicos para el storefront y este no puede serlo).
        products.MapGet("/{id:guid}/costs", async (
            Guid id, ITenantContext tenant, IProductRepository repository, CancellationToken ct) =>
        {
            var product = await repository.GetByIdAsync(tenant.TenantId, id, ct);
            if (product is null) return Results.NotFound();
            return Results.Ok(new
            {
                items = product.Variants.Select(v => new
                {
                    variantId = v.Id,
                    sku = v.Sku,
                    description = v.OptionValues.Count > 0 ? string.Join(" / ", v.OptionValues) : "Única",
                    priceAmount = v.Price.AmountInMinorUnits,
                    costAmount = v.Cost?.AmountInMinorUnits,
                    currency = v.Price.Currency,
                }),
            });
        }).RequirePermission(Permission.CatalogWrite);

        // Bulk para la pantalla de Costos: los costos de una página entera de
        // productos en UN request (antes: un GET por producto visible).
        products.MapGet("/costs", async (
            string? ids, ITenantContext tenant,
            Catalog.Infrastructure.Persistence.CatalogDbContext catalogDb, CancellationToken ct) =>
        {
            var parsed = (ids ?? "")
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select(s => Guid.TryParse(s, out var g) ? g : Guid.Empty)
                .Where(g => g != Guid.Empty)
                .Distinct()
                .Take(100)
                .ToList();
            if (parsed.Count == 0) return Results.Ok(new { items = Array.Empty<object>() });

            var withCosts = await catalogDb.Products.AsNoTracking()
                .Where(p => p.TenantId == tenant.TenantId && parsed.Contains(p.Id))
                .ToListAsync(ct);
            return Results.Ok(new
            {
                items = withCosts.SelectMany(p => p.Variants.Select(VariantCostDto)),
            });
        }).RequirePermission(Permission.CatalogWrite);

        products.MapPut("/{id:guid}/costs", async (
            Guid id, SetVariantCostsRequest request, ITenantContext tenant,
            UpdateProductHandler handler, CancellationToken ct) =>
        {
            var costs = (request.Costs ?? []).Select(c => (c.VariantId, c.CostAmount)).ToList();
            var result = await handler.SetVariantCostsAsync(
                new SetVariantCostsCommand(tenant.TenantId, id, costs, request.Currency ?? Money.DefaultCurrency), ct);
            return result.IsSuccess ? Results.NoContent() : result.Error.ToProblem();
        });
    }
}
