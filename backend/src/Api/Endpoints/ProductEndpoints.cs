using System.IO.Compression;
using Microsoft.EntityFrameworkCore;
using Api.Auth;
using Api.Import;
using Catalog.Core;
using Microsoft.AspNetCore.Http.Features;
using Catalog.Core.Domain;
using Catalog.Core.Features.CreateProduct;
using Catalog.Core.Features.UpdateProduct;
using Microsoft.Extensions.Primitives;
using SharedKernel.Abstractions;

namespace Api.Endpoints;

public static class ProductEndpoints
{
    public static RouteGroupBuilder MapProductEndpoints(this RouteGroupBuilder group)
    {
        var products = group.MapGroup("/products").RequireTenant();

        // TODO: proteger con permisos products:write cuando Identity tenga memberships.
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
                    v.Sku, v.OptionValues ?? [], v.PriceAmount, v.Currency ?? "ARS", v.CompareAtAmount)).ToList() ?? [],
                request.Publish);

            var result = await handler.HandleAsync(command, ct);
            return result.IsSuccess
                ? Results.Created($"/api/v1/products/{result.Value.Id}", result.Value)
                : result.Error.ToProblem();
        });

        products.MapGet("/", async (
            ITenantContext tenant,
            IProductRepository repository,
            CancellationToken ct,
            string? status = null,
            int limit = 20,
            Guid? after = null) =>
        {
            var statusFilter = ProductStatusExtensions.ParseApi(status);

            limit = Math.Clamp(limit, 1, 100);
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
            string[]? option = null) =>
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

            var (items, total, facets) = await repository.SearchAsync(
                tenant.TenantId,
                new ProductSearchFilter(q, category, sortEnum, page, pageSize,
                    ToMinor(priceMin), ToMinor(priceMax),
                    string.IsNullOrWhiteSpace(brand) ? null : brand.Trim(),
                    options is { Count: > 0 } ? options : null),
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
                request.PriceAmount, request.Currency ?? "ARS", request.CompareAtAmount), ct);
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

        // ---- Importación masiva (CSV) ----
        // Encola un job; el worker lo procesa en background. El front consulta
        // el progreso por id. Multipart: file + updateExisting + updateStock.
        products.MapPost("/import", async (
            HttpRequest req,
            ITenantContext tenant,
            ProductImportQueue queue,
            CancellationToken ct) =>
        {
            if (!req.HasFormContentType)
                return Results.BadRequest(new { error = "Se espera multipart/form-data." });

            var form = await req.ReadFormAsync(ct);
            var file = form.Files["file"];
            if (file is null || file.Length == 0)
                return Results.BadRequest(new { error = "Falta el archivo 'file'." });

            using var reader = new StreamReader(file.OpenReadStream());
            var csv = await reader.ReadToEndAsync(ct);

            var options = new ImportOptions(
                ParseFormBool(form["updateExisting"], true),
                ParseFormBool(form["updateStock"], true));
            var total = ProductCsv.MapProducts(csv).Count;

            var job = queue.Create(tenant.TenantId.Value, csv, file.FileName, options, total);
            queue.Enqueue(job.Id);

            return Results.Accepted($"/api/v1/products/import/{job.Id}",
                new { jobId = job.Id, totalProducts = total });
        });

        products.MapGet("/import/{jobId:guid}", (
            Guid jobId, ITenantContext tenant, ProductImportQueue queue) =>
        {
            var job = queue.Get(tenant.TenantId.Value, jobId);
            if (job is null) return Results.NotFound();

            return Results.Ok(new
            {
                jobId = job.Id,
                status = job.Status.ToString().ToLowerInvariant(),
                totalProducts = job.TotalProducts,
                processed = job.Processed,
                created = job.Created,
                updated = job.Updated,
                skipped = job.Skipped,
                imagesImported = job.ImagesImported,
                errorCount = job.ErrorCount,
                errors = job.Errors.Take(100).Select(e => new { e.Line, e.Slug, e.Message }),
                failureMessage = job.FailureMessage,
            });
        }).RequireTenantMembership();

        // ---- Importación masiva de imágenes ----
        // Sube muchas imágenes (o un .zip); se matchean por nombre = slug del
        // producto (con sufijo -N para la galería), fallback a SKU. Encola un job.
        products.MapPost("/images/import", async (
            HttpRequest req,
            ITenantContext tenant,
            ImageImportQueue queue,
            CancellationToken ct) =>
        {
            if (!req.HasFormContentType)
                return Results.BadRequest(new { error = "Se espera multipart/form-data." });

            // Subida grande: cientos/miles de imágenes en un POST. Levantar el
            // tope de tamaño (default 30MB) y el de secciones multipart (default 1024).
            var sizeFeature = req.HttpContext.Features.Get<IHttpMaxRequestBodySizeFeature>();
            if (sizeFeature is { IsReadOnly: false }) sizeFeature.MaxRequestBodySize = null;
            req.HttpContext.Features.Set<IFormFeature>(new FormFeature(req, new FormOptions
            {
                ValueCountLimit = int.MaxValue,
                MultipartBodyLengthLimit = long.MaxValue,
                MultipartHeadersCountLimit = int.MaxValue,
            }));

            var form = await req.ReadFormAsync(ct);
            if (form.Files.Count == 0)
                return Results.BadRequest(new { error = "No se subió ninguna imagen." });

            var jobId = Guid.NewGuid();
            var tempDir = Path.Combine(Path.GetTempPath(), "tiendafy-img-import", jobId.ToString("N"));
            Directory.CreateDirectory(tempDir);

            var total = 0;
            foreach (var file in form.Files)
            {
                var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
                if (ext == ".zip")
                    total += await ExtractZipAsync(file, tempDir, ct);
                else if (ext == ".csv")
                {
                    // CSV de mapeo (handle → archivos). El worker lo usa para asociar exacto.
                    await using var fs = File.Create(Path.Combine(tempDir, "__mapping.csv"));
                    await file.CopyToAsync(fs, ct);
                }
                else if (ImageExtensions.Contains(ext))
                {
                    var dest = Path.Combine(tempDir, SafeFileName(file.FileName));
                    await using var fs = File.Create(dest);
                    await file.CopyToAsync(fs, ct);
                    total++;
                }
            }

            if (total == 0)
            {
                try { Directory.Delete(tempDir, true); } catch { /* best effort */ }
                return Results.BadRequest(new { error = "No se encontraron imágenes (jpg, png, webp, avif) ni un .zip con imágenes." });
            }

            var job = queue.Create(tenant.TenantId.Value, tempDir, total);
            queue.Enqueue(job.Id);
            return Results.Accepted($"/api/v1/products/images/import/{job.Id}",
                new { jobId = job.Id, totalFiles = total });
        }).DisableAntiforgery();

        products.MapGet("/images/import/{jobId:guid}", (
            Guid jobId, ITenantContext tenant, ImageImportQueue queue) =>
        {
            var job = queue.Get(tenant.TenantId.Value, jobId);
            if (job is null) return Results.NotFound();

            return Results.Ok(new
            {
                jobId = job.Id,
                status = job.Status.ToString().ToLowerInvariant(),
                totalFiles = job.TotalFiles,
                processed = job.Processed,
                matchedProducts = job.MatchedProducts,
                imagesAdded = job.ImagesAdded,
                unmatchedFiles = job.UnmatchedFiles,
                unmatchedSample = job.UnmatchedSample,
                failureMessage = job.FailureMessage,
            });
        }).RequireTenantMembership();

        // ---- Exportación masiva (CSV) ----
        // Recorre TODOS los productos del tenant (no el tope de 100 del listado).
        products.MapGet("/export", async (
            ITenantContext tenant,
            IProductRepository repository,
            ICategoryRepository categoryRepository,
            CancellationToken ct,
            bool includeDescriptions = true) =>
        {
            var all = new List<Product>();
            Guid? after = null;
            while (true)
            {
                var page = await repository.ListAsync(tenant.TenantId, null, 100, after, ct);
                all.AddRange(page);
                if (page.Count < 100) break;
                after = page[^1].Id;
            }

            // Mapa id → path display ("Indumentaria > Remeras") subiendo por ParentId.
            var categories = await categoryRepository.ListAsync(tenant.TenantId, ct);
            var byId = categories.ToDictionary(c => c.Id);
            var paths = categories.ToDictionary(c => c.Id, c =>
            {
                var names = new List<string>();
                Category? cur = c;
                for (var guard = 0; cur is not null && guard < Category.MaxDepth + 1; guard++)
                {
                    names.Insert(0, cur.Name);
                    cur = cur.ParentId is { } pid && byId.TryGetValue(pid, out var parent) ? parent : null;
                }
                return string.Join(" > ", names);
            });

            var csv = ProductCsv.BuildExport(all, includeDescriptions, paths);
            var bytes = System.Text.Encoding.UTF8.GetBytes(csv);
            return Results.File(bytes, "text/csv; charset=utf-8", "productos.csv");
        }).RequireTenantMembership();

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
            CancellationToken ct) =>
        {
            var product = await repository.GetBySlugAsync(tenant.TenantId, slug, ct);
            return product is null || product.Status != ProductStatus.Active
                ? Results.NotFound()
                : Results.Ok(product.ToDto());
        });

        return group;
    }

    private static bool ParseFormBool(StringValues value, bool fallback)
    {
        var s = value.ToString().Trim().ToLowerInvariant();
        if (s.Length == 0) return fallback;
        return s is "true" or "1" or "on" or "yes" or "si";
    }

    private static readonly HashSet<string> ImageExtensions =
        new(StringComparer.OrdinalIgnoreCase) { ".jpg", ".jpeg", ".png", ".webp", ".avif" };

    /// <summary>Extrae las imágenes de un .zip al dir temporal (aplana, nombre base).</summary>
    private static async Task<int> ExtractZipAsync(IFormFile file, string tempDir, CancellationToken ct)
    {
        var count = 0;
        await using var stream = file.OpenReadStream();
        using var archive = new ZipArchive(stream, ZipArchiveMode.Read);
        foreach (var entry in archive.Entries)
        {
            if (string.IsNullOrEmpty(entry.Name)) continue; // carpeta
            if (!ImageExtensions.Contains(Path.GetExtension(entry.Name))) continue;

            var dest = Path.Combine(tempDir, SafeFileName(entry.Name));
            await using var es = entry.Open();
            await using var fs = File.Create(dest);
            await es.CopyToAsync(fs, ct);
            count++;
        }
        return count;
    }

    /// <summary>Nombre de archivo seguro: solo el basename, sin componentes de path.</summary>
    private static string SafeFileName(string name) => Path.GetFileName(name);
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

public sealed record VariantInput(
    string Sku,
    List<string>? OptionValues,
    long PriceAmount,
    string? Currency,
    long? CompareAtAmount);
