using Api.Auth;
using Catalog.Core;
using Catalog.Core.Domain;
using Catalog.Core.Features.CreateProduct;
using Catalog.Core.Features.UpdateProduct;
using Identity.Infrastructure;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace Api.Endpoints;

public static partial class ProductEndpoints
{
    public static RouteGroupBuilder MapProductEndpoints(this RouteGroupBuilder group)
    {
        var products = group.MapGroup("/products").RequireTenant().RequirePermissionForWrites(Permission.CatalogWrite);

        products.MapPost("/", async (
            CreateProductRequest request,
            ITenantContext tenant,
            CreateProductHandler handler,
            CancellationToken ct) =>
        {
            var command = new CreateProductCommand(
                tenant.TenantId,
                request.Name,
                request.Description,
                request.Options?.Select(o => new CreateProductOption(o.Name, o.Values)).ToList() ?? [],
                request.Variants?.Select(v => new CreateProductVariant(
                    v.Sku, v.OptionValues ?? [], v.PriceAmount, v.Currency ?? Money.DefaultCurrency, v.CompareAtAmount)).ToList() ?? [],
                request.Publish);

            var result = await handler.HandleAsync(command, ct);
            return result.IsSuccess
                ? Results.Created($"/api/v1/products/{result.Value.Id}", result.Value)
                : result.Error.ToProblem();
        });

        products.MapGet("/", async (
            ITenantContext tenant,
            IProductRepository repository,
            Inventory.Infrastructure.Persistence.InventoryDbContext inventoryDb,
            CancellationToken ct,
            string? status = null,
            int limit = 20,
            Guid? after = null,
            int? offset = null,
            string? q = null,
            string? ids = null,
            bool? missingCost = null,
            bool? missingImage = null,
            bool? promo = null,
            string? stock = null,
            int? lowStockThreshold = null,
            Guid? categoryId = null,
            string? sort = null) =>
        {
            var statusFilter = ProductStatusExtensions.ParseApi(status);
            limit = Math.Clamp(limit, 1, 100);

            // Resolver por id: lo usan los selectores para poner el nombre de lo
            // ya elegido. Sin esto, un buscador que trae 20 productos por vez no
            // sabe cómo se llama lo que el usuario eligió hace tres búsquedas.
            if (!string.IsNullOrWhiteSpace(ids))
            {
                var wanted = ids.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                    .Select(x => Guid.TryParse(x, out var g) ? g : Guid.Empty)
                    .Where(g => g != Guid.Empty)
                    .Distinct()
                    .Take(100)
                    .ToList();

                if (wanted.Count == 0) return Results.Ok(new { items = Array.Empty<object>(), total = 0 });

                // Una consulta, no una por id: eran hasta cien idas a la base.
                var found = await repository.ListByIdsAsync(tenant.TenantId, wanted, ct);
                return Results.Ok(new { items = found.Select(p => p.ToDto()).ToList(), total = found.Count });
            }

            var paged = offset is not null
                || !string.IsNullOrWhiteSpace(q)
                || missingCost == true || missingImage == true
                || promo is not null || !string.IsNullOrWhiteSpace(stock)
                || categoryId is not null || sort is not null;

            // Modo página (offset/filtros): lo que usan el listado del panel,
            // Costos, Inventario y los buscadores de variantes. El modo cursor
            // (after) queda para quien recorre el catálogo entero (export,
            // importación) y no debe cambiar.
            if (after is null && paged)
            {
                // El stock vive en otro módulo, así que el filtro se arma acá:
                // el catálogo recibe la lista de variantes que cumplen, ya resuelta.
                //
                // "in"  → productos con alguna variante disponible
                // "out" → productos sin ninguna (la lista es la misma; cambia el sí/no)
                // "low" → productos con alguna a punto de agotarse
                List<Guid>? matching = null;
                bool? hasMatching = null;
                if (!string.IsNullOrWhiteSpace(stock))
                {
                    var low = Math.Clamp(lowStockThreshold ?? 5, 1, 100);
                    var mode = stock.Trim().ToLowerInvariant();

                    var available = inventoryDb.StockItems.AsNoTracking().Where(s => s.Available > 0);
                    if (mode == "low") available = available.Where(s => s.Available <= low);

                    matching = await available.Select(s => s.VariantId).ToListAsync(ct);
                    hasMatching = mode != "out";
                }

                var filter = new AdminProductFilter(
                    statusFilter, q, categoryId,
                    missingCost == true, missingImage == true, promo,
                    matching, hasMatching, ParseSort(sort));

                var (pageItems, total) = await repository.ListPageAsync(
                    tenant.TenantId, filter, limit, Math.Max(0, offset ?? 0), ct);
                return Results.Ok(new
                {
                    items = pageItems.Select(p => p.ToDto()).ToList(),
                    total,
                    hasMore = (offset ?? 0) + pageItems.Count < total,
                });
            }

            var page = await repository.ListAsync(tenant.TenantId, statusFilter, limit + 1, after, ct);
            var hasMore = page.Count > limit;
            var items = page.Take(limit).Select(p => p.ToDto()).ToList();

            return Results.Ok(new
            {
                items,
                nextCursor = hasMore ? items[^1].Id.ToString() : null,
                hasMore,
            });
        });

        // Salud del catálogo: qué falta completar antes de que un producto pueda
        // venderse bien (foto, costo) y cuánto margen deja lo que sí está cargado.
        products.MapGet("/health", async (
            ITenantContext tenant,
            Catalog.Infrastructure.Persistence.CatalogDbContext catalogDb, CancellationToken ct) =>
        {

            var mine = catalogDb.Products.AsNoTracking().Where(p => p.TenantId == tenant.TenantId);

            var byStatus = await mine
                .GroupBy(p => p.Status)
                .Select(g => new { Status = g.Key, Count = g.Count() })
                .ToListAsync(ct);
            int Count(ProductStatus s) => byStatus.FirstOrDefault(x => x.Status == s)?.Count ?? 0;

            var withoutImage = await mine.CountAsync(p => !p.Images.Any(), ct);

            // Precio y costo, nada más: el costo va serializado en texto y no se
            // puede agregar en SQL, pero al menos no se trae el producto entero.
            var priced = await mine
                .SelectMany(p => p.Variants)
                .Select(v => new { Price = v.Price.AmountInMinorUnits, v.Cost })
                .ToListAsync(ct);

            // El margen promedio se calcula SOLO sobre lo que tiene costo cargado:
            // contar el resto como margen 100 % sería inventar el número.
            var margins = priced
                .Where(v => v.Cost is { } c && v.Price > 0 && c.AmountInMinorUnits > 0)
                .Select(v => (v.Price - v.Cost!.Value.AmountInMinorUnits) * 100m / v.Price)
                .ToList();

            return Results.Ok(new
            {
                total = byStatus.Sum(x => x.Count),
                published = Count(ProductStatus.Active),
                draft = Count(ProductStatus.Draft),
                archived = Count(ProductStatus.Archived),
                withoutImage,
                variants = priced.Count,
                variantsWithCost = priced.Count(v => v.Cost is not null),
                variantsWithoutCost = priced.Count(v => v.Cost is null),
                averageMarginPct = margins.Count > 0 ? Math.Round(margins.Average(), 1) : 0m,
                lowMarginVariants = margins.Count(m => m < 15),
            });
        }).RequireAnyPermission(Permission.CatalogWrite, Permission.CostsRead); // la usan Productos y Costos

        // Storefront: búsqueda con filtros, orden y paginado (estilo marketplace).
        products.MapGet("/search", async (
            ITenantContext tenant,
            IProductRepository repository,
            Inventory.Core.Domain.IStockRepository stockRepository,
            CancellationToken ct,
            string? q = null,
            Guid? category = null,
            string? sort = null,
            int page = 1,
            int pageSize = 24,
            // Filtros: precio en PESOS (se convierte a centavos), marca, y valores de
            // opción repetibles (?option=Rojo&option=M).
            decimal? priceMin = null,
            decimal? priceMax = null,
            string? brand = null,
            string[]? option = null,
            string[]? spec = null) =>
        {
            page = Math.Max(1, page);
            pageSize = Math.Clamp(pageSize, 1, 48);

            var sortEnum = sort?.ToLowerInvariant() switch
            {
                "price_asc" => ProductSort.PriceAsc,
                "price_desc" => ProductSort.PriceDesc,
                "name" or "name_asc" => ProductSort.NameAsc,
                _ => ProductSort.Newest,
            };

            // Pesos → centavos (unidades menores). Ignora negativos.
            long? ToMinor(decimal? p) => p is > 0 ? (long)Math.Round(p.Value * 100) : null;
            var options = option?.Where(o => !string.IsNullOrWhiteSpace(o)).Select(o => o.Trim()).Distinct().ToList();

            // Ficha técnica: llega como spec=<id>:<valor>, repetido. Se agrupa
            // por campo para que dos valores del mismo campo sumen en vez de
            // restar.
            var specFilters = (spec ?? [])
                .Select(raw => raw.Split(':', 2))
                .Where(parts => parts.Length == 2 && Guid.TryParse(parts[0], out _) && parts[1].Trim().Length > 0)
                .GroupBy(parts => Guid.Parse(parts[0]))
                .Select(g => new SpecFilter(g.Key, g.Select(parts => parts[1].Trim()).Distinct().Take(30).ToList()))
                .Take(10)
                .ToList();

            var (items, total, facets) = await repository.SearchAsync(
                tenant.TenantId,
                new ProductSearchFilter(q, category, sortEnum, page, pageSize,
                    ToMinor(priceMin), ToMinor(priceMax),
                    string.IsNullOrWhiteSpace(brand) ? null : brand.Trim(),
                    options is { Count: > 0 } ? options : null,
                    specFilters.Count > 0 ? specFilters : null),
                ct);

            // Stock por producto (suma de sus variantes) para badges en la card.
            var variantIds = items.SelectMany(p => p.Variants.Select(v => v.Id)).ToList();
            var stockByVariant = variantIds.Count > 0
                ? (await stockRepository.GetByVariantsAsync(tenant.TenantId, variantIds, ct)).ToDictionary(s => s.VariantId, s => s.Available)
                : new Dictionary<Guid, int>();
            int StockFor(Product p) => p.Variants.Sum(v => stockByVariant.TryGetValue(v.Id, out var a) ? a : 0);

            return Results.Ok(new
            {
                items = items.Select(p => p.ToDto() with { Stock = StockFor(p) }),
                total,
                page,
                pageSize,
                totalPages = (int)Math.Ceiling(total / (double)pageSize),
                facets = new
                {
                    brands = facets.Brands,
                    options = facets.Options.Select(o => new { name = o.Name, values = o.Values }),
                    priceMin = facets.PriceMin,
                    priceMax = facets.PriceMax,
                    specs = facets.Specs.Select(f => new
                    {
                        definitionId = f.DefinitionId,
                        key = f.Key,
                        name = f.Name,
                        unit = f.Unit,
                        values = f.Values,
                    }),
                },
            });
        });

        products.MapGet("/{id:guid}", async (
            Guid id,
            ITenantContext tenant,
            IProductRepository repository,
            CancellationToken ct) =>
        {
            var product = await repository.GetByIdAsync(tenant.TenantId, id, ct);
            return product is null ? Results.NotFound() : Results.Ok(product.ToDto());
        });

        products.MapPatch("/{id:guid}", async (
            Guid id,
            UpdateProductRequest request,
            ITenantContext tenant,
            UpdateProductHandler handler,
            CancellationToken ct) =>
        {
            var result = await handler.UpdateDetailsAsync(
                new UpdateProductDetailsCommand(tenant.TenantId, id, request.Name, request.Description, request.SeoTitle, request.SeoDescription, request.Brand), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToProblem();
        });

        products.MapPost("/{id:guid}/duplicate", async (
            Guid id, ITenantContext tenant, UpdateProductHandler handler, CancellationToken ct) =>
        {
            var result = await handler.DuplicateAsync(tenant.TenantId, id, ct);
            return result.IsSuccess
                ? Results.Created($"/api/v1/products/{result.Value.Id}", result.Value)
                : result.Error.ToProblem();
        });

        products.MapPut("/{id:guid}/images/reorder", async (
            Guid id, ReorderImagesRequest request, ITenantContext tenant, UpdateProductHandler handler, CancellationToken ct) =>
        {
            var result = await handler.ReorderImagesAsync(
                new ReorderImagesCommand(tenant.TenantId, id, request.ImageIds ?? []), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToProblem();
        });

        products.MapPost("/{id:guid}/publish", async (
            Guid id, ITenantContext tenant, UpdateProductHandler handler, CancellationToken ct) =>
        {
            var result = await handler.SetStatusAsync(new SetProductStatusCommand(tenant.TenantId, id, true), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToProblem();
        });

        products.MapPost("/{id:guid}/archive", async (
            Guid id, ITenantContext tenant, UpdateProductHandler handler, CancellationToken ct) =>
        {
            var result = await handler.SetStatusAsync(new SetProductStatusCommand(tenant.TenantId, id, false), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToProblem();
        });

        products.MapPatch("/{id:guid}/variants/{variantId:guid}/price", async (
            Guid id,
            Guid variantId,
            ChangePriceRequest request,
            ITenantContext tenant,
            UpdateProductHandler handler,
            CancellationToken ct) =>
        {
            var result = await handler.ChangeVariantPriceAsync(new ChangeVariantPriceCommand(
                tenant.TenantId, id, variantId,
                request.PriceAmount, request.Currency ?? Money.DefaultCurrency, request.CompareAtAmount), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToProblem();
        });

        products.MapPost("/{id:guid}/images", async (
            Guid id,
            AddImageRequest request,
            ITenantContext tenant,
            UpdateProductHandler handler,
            CancellationToken ct) =>
        {
            var result = await handler.AddImageAsync(
                new AddImageCommand(tenant.TenantId, id, request.Url, request.AltText), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToProblem();
        });

        products.MapDelete("/{id:guid}/images/{imageId:guid}", async (
            Guid id,
            Guid imageId,
            ITenantContext tenant,
            UpdateProductHandler handler,
            CancellationToken ct) =>
        {
            var result = await handler.RemoveImageAsync(new RemoveImageCommand(tenant.TenantId, id, imageId), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToProblem();
        });

        MapBulk(products);

        MapWarehouse(products);

        MapPricing(products);

        // Asignar/cambiar las categorías de un producto (para el admin).
        products.MapPut("/{id:guid}/categories", async (
            Guid id,
            SetCategoriesRequest request,
            ITenantContext tenant,
            IProductRepository repository,
            Catalog.Infrastructure.Persistence.CatalogDbContext db,
            CancellationToken ct) =>
        {
            var product = await repository.GetByIdAsync(tenant.TenantId, id, ct);
            if (product is null) return Results.NotFound();

            product.SetCategories(request.CategoryIds ?? []);
            await db.SaveChangesAsync(ct);
            return Results.Ok(product.ToDto());
        });

        MapSpecDefinitions(group);

        // Ficha técnica del producto: se manda entera y reemplaza lo anterior.
        products.MapPut("/{id:guid}/specs", async (
            Guid id,
            SetSpecsRequest request,
            ITenantContext tenant,
            IProductRepository repository,
            Catalog.Infrastructure.Persistence.CatalogDbContext db,
            CancellationToken ct) =>
        {
            var product = await repository.GetByIdAsync(tenant.TenantId, id, ct);
            if (product is null) return Results.NotFound();

            // Solo se aceptan campos que existan en esta tienda: un id inventado
            // dejaría un valor colgado que después nadie sabe leer.
            var known = await db.SpecDefinitions.AsNoTracking()
                .Where(d => d.TenantId == tenant.TenantId)
                .Select(d => d.Id).ToListAsync(ct);

            product.SetSpecs((request.Values ?? [])
                .Where(v => known.Contains(v.DefinitionId))
                .Select(v => (v.DefinitionId, v.Value)));

            await db.SaveChangesAsync(ct);
            return Results.Ok(product.ToDto());
        }).RequirePermission(Permission.CatalogWrite);

        // Eliminar TODOS los productos del tenant (con sus imágenes del storage).
        products.MapDelete("/", async (
            ITenantContext tenant,
            Catalog.Infrastructure.Persistence.CatalogDbContext db,
            Media.Infrastructure.IMediaStorage media,
            CancellationToken ct) =>
        {
            var tid = tenant.TenantId;
            var all = await db.Products.Where(p => p.TenantId == tid).ToListAsync(ct);

            // Borrar las imágenes re-hospedadas del storage (best-effort).
            foreach (var product in all)
                foreach (var image in product.Images)
                    await media.DeleteAsync(image.Url, ct);

            db.Products.RemoveRange(all);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { deleted = all.Count });
        });

        // Eliminar producto (hard delete; variantes/imágenes/opciones caen en cascada).
        products.MapDelete("/{id:guid}", async (
            Guid id,
            ITenantContext tenant,
            IProductRepository repository,
            Catalog.Infrastructure.Persistence.CatalogDbContext db,
            CancellationToken ct) =>
        {
            var product = await repository.GetByIdAsync(tenant.TenantId, id, ct);
            if (product is null) return Results.NotFound();

            db.Products.Remove(product);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        // Storefront: detalle por slug (solo productos publicados).
        products.MapGet("/by-slug/{slug}", async (
            string slug,
            ITenantContext tenant,
            IProductRepository repository,
            Inventory.Core.Domain.IStockRepository stockRepository,
            CancellationToken ct) =>
        {
            var product = await repository.GetBySlugAsync(tenant.TenantId, slug, ct);
            if (product is null || product.Status != ProductStatus.Active)
                return Results.NotFound();

            // Stock total (suma de variantes): el detalle lo usa para el
            // "availability" real del JSON-LD (InStock/OutOfStock) y el badge.
            var variantIds = product.Variants.Select(v => v.Id).ToList();
            var stock = variantIds.Count > 0
                ? (await stockRepository.GetByVariantsAsync(tenant.TenantId, variantIds, ct)).Sum(s => s.Available)
                : 0;

            return Results.Ok(product.ToDto() with { Stock = stock });
        });

        return group;
    }

    private static IResult MultipartExpected() =>
        Error.Validation("Import.MultipartExpected", "Se espera multipart/form-data.").ToProblem();
    /// <summary>
    /// Variante con precio y costo: la forma exacta que consume la pantalla de
    /// Costos, servida tanto de a un producto como en el bulk de la página.
    /// </summary>
    private static object VariantCostDto(Catalog.Core.Domain.Variant v) => new
    {
        variantId = v.Id,
        sku = v.Sku,
        description = v.OptionValues.Count > 0 ? string.Join(" / ", v.OptionValues) : "Única",
        priceAmount = v.Price.AmountInMinorUnits,
        costAmount = v.Cost?.AmountInMinorUnits,
        currency = v.Price.Currency,
    };


    /// <summary>Orden del listado del panel. Sin valor válido, lo más nuevo primero.</summary>
    private static AdminProductSort ParseSort(string? sort) => sort?.ToLowerInvariant() switch
    {
        "oldest" => AdminProductSort.Oldest,
        "nameasc" => AdminProductSort.NameAsc,
        "namedesc" => AdminProductSort.NameDesc,
        _ => AdminProductSort.Newest,
    };

    // ------------------------------------------------ Campos de ficha técnica

    /// <summary>
    /// Los campos de ficha técnica que definió esta tienda. Son por tienda
    /// porque cada una vende otra cosa, y se acotan por categoría para que
    /// quien carga un producto no vea cuarenta campos que no aplican.
    /// </summary>
    private static void MapSpecDefinitions(RouteGroupBuilder group)
    {
        var specs = group.MapGroup("/spec-definitions").RequireTenant();

        // Público: el storefront necesita el nombre y la unidad de cada campo
        // para mostrar la ficha. No hay nada privado acá.
        specs.MapGet("/", async (
            ITenantContext tenant, Catalog.Infrastructure.Persistence.CatalogDbContext db, CancellationToken ct) =>
        {
            var items = await db.SpecDefinitions.AsNoTracking()
                .Where(d => d.TenantId == tenant.TenantId)
                .OrderBy(d => d.SortOrder).ThenBy(d => d.Name)
                .ToListAsync(ct);
            return Results.Ok(new { items = items.Select(SpecDto) });
        });

        specs.MapPost("/", async (
            SpecDefinitionRequest request, ITenantContext tenant,
            Catalog.Infrastructure.Persistence.CatalogDbContext db, CancellationToken ct) =>
        {
            var next = await db.SpecDefinitions.CountAsync(d => d.TenantId == tenant.TenantId, ct);
            var created = SpecDefinition.Create(tenant.TenantId, request.Name, ParseSpecType(request.Type), next);
            if (created.IsFailure) return created.Error.ToProblem();

            var definition = created.Value;
            if (await db.SpecDefinitions.AnyAsync(d => d.TenantId == tenant.TenantId && d.Key == definition.Key, ct))
                return Error.Conflict("Spec.Duplicate", $"Ya tenes un campo llamado {definition.Name}.").ToProblem();

            var applied = ApplySpec(definition, request);
            if (applied.IsFailure) return applied.Error.ToProblem();

            db.SpecDefinitions.Add(definition);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/spec-definitions/{definition.Id}", SpecDto(definition));
        }).RequirePermission(Permission.CatalogWrite);

        specs.MapPut("/{id:guid}", async (
            Guid id, SpecDefinitionRequest request, ITenantContext tenant,
            Catalog.Infrastructure.Persistence.CatalogDbContext db, CancellationToken ct) =>
        {
            var definition = await db.SpecDefinitions
                .FirstOrDefaultAsync(d => d.TenantId == tenant.TenantId && d.Id == id, ct);
            if (definition is null) return Results.NotFound();

            var applied = ApplySpec(definition, request);
            if (applied.IsFailure) return applied.Error.ToProblem();

            await db.SaveChangesAsync(ct);
            return Results.Ok(SpecDto(definition));
        }).RequirePermission(Permission.CatalogWrite);

        specs.MapDelete("/{id:guid}", async (
            Guid id, ITenantContext tenant,
            Catalog.Infrastructure.Persistence.CatalogDbContext db, CancellationToken ct) =>
        {
            var definition = await db.SpecDefinitions
                .FirstOrDefaultAsync(d => d.TenantId == tenant.TenantId && d.Id == id, ct);
            if (definition is null) return Results.NoContent();

            // Los valores cargados en los productos se van con el campo: dejarlos
            // huerfanos seria guardar datos que despues nadie puede leer.
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"DELETE FROM product_specs WHERE definition_id = {id}", ct);
            db.SpecDefinitions.Remove(definition);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        }).RequirePermission(Permission.CatalogWrite);
    }

    private static SpecType ParseSpecType(string? raw) => raw?.ToUpperInvariant() switch
    {
        "NUMBER" => SpecType.Number,
        "BOOLEAN" => SpecType.Boolean,
        "LIST" => SpecType.List,
        _ => SpecType.Text,
    };

    private static Result ApplySpec(SpecDefinition definition, SpecDefinitionRequest request) =>
        definition.Update(
            request.Name,
            ParseSpecType(request.Type),
            request.Unit,
            request.Options,
            request.CategoryIds,
            request.ShowOnProduct,
            request.Filterable,
            request.MeliAttributeId,
            request.SortOrder);

    private static object SpecDto(SpecDefinition d) => new
    {
        d.Id,
        d.Name,
        d.Key,
        type = d.Type.ToString().ToUpperInvariant(),
        d.Unit,
        d.Options,
        d.CategoryIds,
        d.ShowOnProduct,
        d.Filterable,
        d.MeliAttributeId,
        d.SortOrder,
    };

}

public sealed record CreateProductRequest(
    string Name,
    string? Description,
    List<OptionInput>? Options,
    List<VariantInput>? Variants,
    bool Publish = false);

public sealed record OptionInput(string Name, List<string> Values);

public sealed record UpdateProductRequest(string Name, string? Description, string? SeoTitle, string? SeoDescription, string? Brand = null);

public sealed record ReorderImagesRequest(List<Guid>? ImageIds);

public sealed record ChangePriceRequest(long PriceAmount, string? Currency, long? CompareAtAmount);

public sealed record AddImageRequest(string Url, string? AltText);

public sealed record SetCategoriesRequest(List<Guid>? CategoryIds);

public sealed record RepriceRequest(decimal Percent, Guid? CategoryId, string? Rounding);
public sealed record SetBarcodeRequest(string? Barcode);

public sealed record KitComponentEntry(Guid ComponentVariantId, int Quantity);

public sealed record SetKitRequest(List<KitComponentEntry>? Components);

public sealed record VariantCostEntry(Guid VariantId, long? CostAmount);

public sealed record SetVariantCostsRequest(List<VariantCostEntry>? Costs, string? Currency);

public sealed record VariantInput(
    string Sku,
    List<string>? OptionValues,
    long PriceAmount,
    string? Currency,
    long? CompareAtAmount);

public sealed record SetSpecsRequest(List<ProductSpecValue>? Values);
public sealed record ProductSpecValue(Guid DefinitionId, string? Value);

public sealed record SpecDefinitionRequest(
    string? Name,
    string? Type,
    string? Unit,
    List<string>? Options,
    List<Guid>? CategoryIds,
    bool ShowOnProduct,
    bool Filterable,
    string? MeliAttributeId,
    int SortOrder);
