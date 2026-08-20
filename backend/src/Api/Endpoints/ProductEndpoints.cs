using Api.Auth;
using Api.Import;
using Catalog.Core;
using Catalog.Core.Domain;
using Catalog.Core.Features.CreateProduct;
using Catalog.Core.Features.UpdateProduct;
using Identity.Infrastructure;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace Api.Endpoints;

public static class ProductEndpoints
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
            bool? missingCost = null,
            bool? missingImage = null,
            bool? promo = null,
            bool? inStock = null,
            Guid? categoryId = null,
            string? sort = null) =>
        {
            var statusFilter = ProductStatusExtensions.ParseApi(status);
            limit = Math.Clamp(limit, 1, 100);

            var paged = offset is not null
                || !string.IsNullOrWhiteSpace(q)
                || missingCost == true || missingImage == true
                || promo is not null || inStock is not null
                || categoryId is not null || sort is not null;

            // Modo página (offset/filtros): lo que usan el listado del panel,
            // Costos, Inventario y los buscadores de variantes. El modo cursor
            // (after) queda para quien recorre el catálogo entero (export,
            // importación) y no debe cambiar.
            if (after is null && paged)
            {
                // El stock vive en otro módulo, así que el filtro se arma acá:
                // el catálogo recibe la lista de variantes disponibles ya resuelta.
                List<Guid>? withStock = null;
                if (inStock is not null)
                {
                    withStock = await inventoryDb.StockItems.AsNoTracking()
                        .Where(s => s.Available > 0)
                        .Select(s => s.VariantId)
                        .ToListAsync(ct);
                }

                var filter = new AdminProductFilter(
                    statusFilter, q, categoryId,
                    missingCost == true, missingImage == true, promo,
                    withStock, inStock, ParseSort(sort));

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
            HttpContext http, ITenantContext tenant,
            Catalog.Infrastructure.Persistence.CatalogDbContext catalogDb, CancellationToken ct) =>
        {
            if (await AuthExtensions.CheckPermissionAsync(http, Permission.CatalogWrite) is { } denied) return denied;

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
        }).RequireTenantMembership();

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
                return MultipartExpected();

            var form = await req.ReadFormAsync(ct);
            var file = form.Files["file"];
            if (file is null || file.Length == 0)
                return Results.BadRequest(new { error = "Falta el archivo 'file'." });

            using var reader = new StreamReader(file.OpenReadStream());
            var csv = await reader.ReadToEndAsync(ct);

            var options = new ImportOptions(
                ProductImportEndpointHelpers.ParseFormBool(form["updateExisting"], true),
                ProductImportEndpointHelpers.ParseFormBool(form["updateStock"], true));
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
                return MultipartExpected();

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
                    total += await ProductImportEndpointHelpers.ExtractZipAsync(file, tempDir, ct);
                else if (ext == ".csv")
                {
                    // CSV de mapeo (handle → archivos). El worker lo usa para asociar exacto.
                    await using var fs = File.Create(Path.Combine(tempDir, "__mapping.csv"));
                    await file.CopyToAsync(fs, ct);
                }
                else if (ImportMedia.ImageExtensions.Contains(ext))
                {
                    var dest = Path.Combine(tempDir, ProductImportEndpointHelpers.SafeFileName(file.FileName));
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
            var all = await ProductImportEndpointHelpers.LoadAllProductsAsync(repository, tenant.TenantId, ct);

            // Mapa id → path display ("Indumentaria > Remeras") subiendo por ParentId.
            var categories = await categoryRepository.ListAsync(tenant.TenantId, ct);
            var paths = ProductImportEndpointHelpers.BuildCategoryPaths(categories);

            var csv = ProductCsv.BuildExport(all, includeDescriptions, paths);
            var bytes = System.Text.Encoding.UTF8.GetBytes(csv);
            return Results.File(bytes, "text/csv; charset=utf-8", "productos.csv");
        }).RequireTenantMembership();

        // ---- Kits (BOM liviano): componentes que se descuentan al vender ----
        products.MapGet("/kits", async (
            HttpContext http, ITenantContext tenant,
            Catalog.Infrastructure.Persistence.CatalogDbContext catalogDb,
            Catalog.Contracts.ICatalogCheckoutQuery catalogQuery, CancellationToken ct) =>
        {
            if (await AuthExtensions.CheckPermissionAsync(http, Permission.CatalogWrite) is { } denied) return denied;
            var components = await catalogDb.KitComponents.AsNoTracking().ToListAsync(ct);
            var allIds = components.SelectMany(c => new[] { c.KitVariantId, c.ComponentVariantId }).Distinct().ToList();
            var names = allIds.Count == 0
                ? []
                : (await catalogQuery.GetVariantsAsync(tenant.TenantId.Value, allIds, ct)).ToDictionary(v => v.VariantId);

            string Label(Guid id) => names.TryGetValue(id, out var v)
                ? $"{v.ProductName}{(v.VariantDescription is "Única" or "" ? "" : $" · {v.VariantDescription}")}"
                : "(variante borrada)";

            return Results.Ok(new
            {
                items = components.GroupBy(c => c.KitVariantId).Select(g => new
                {
                    kitVariantId = g.Key,
                    kitLabel = Label(g.Key),
                    kitSku = names.TryGetValue(g.Key, out var kv) ? kv.Sku : "",
                    components = g.Select(c => new
                    {
                        componentVariantId = c.ComponentVariantId,
                        label = Label(c.ComponentVariantId),
                        sku = names.TryGetValue(c.ComponentVariantId, out var cv) ? cv.Sku : "",
                        quantity = c.Quantity,
                    }),
                }),
            });
        });

        products.MapPut("/variants/{variantId:guid}/kit", async (
            Guid variantId, SetKitRequest request, HttpContext http, ITenantContext tenant,
            Catalog.Infrastructure.Persistence.CatalogDbContext catalogDb,
            Catalog.Contracts.ICatalogCheckoutQuery catalogQuery, CancellationToken ct) =>
        {
            if (await AuthExtensions.CheckPermissionAsync(http, Permission.CatalogWrite) is { } denied) return denied;
            var entries = request.Components ?? [];
            if (entries.Any(e => e.Quantity is < 1 or > 999))
                return Error.Validation("Kit.InvalidQuantity", "Cantidades entre 1 y 999.").ToProblem();
            if (entries.Any(e => e.ComponentVariantId == variantId))
                return Error.Validation("Kit.SelfReference", "Un kit no puede contenerse a sí mismo.").ToProblem();
            if (entries.Select(e => e.ComponentVariantId).Distinct().Count() != entries.Count)
                return Error.Validation("Kit.Duplicate", "Cada componente va una sola vez.").ToProblem();

            var ids = entries.Select(e => e.ComponentVariantId).Append(variantId).Distinct().ToList();
            var known = (await catalogQuery.GetVariantsAsync(tenant.TenantId.Value, ids, ct))
                .Select(v => v.VariantId).ToHashSet();
            if (ids.Any(id => !known.Contains(id)))
                return Error.NotFound("Kit.VariantNotFound", "Alguna variante no existe.").ToProblem();

            // Sin kits anidados: un componente no puede tener BOM propio.
            var componentIds = entries.Select(e => e.ComponentVariantId).ToList();
            if (componentIds.Count > 0 && await catalogDb.KitComponents.AnyAsync(k => componentIds.Contains(k.KitVariantId), ct))
                return Error.Validation("Kit.Nested", "Un componente no puede ser a su vez un kit.").ToProblem();

            var existing = await catalogDb.KitComponents.Where(k => k.KitVariantId == variantId).ToListAsync(ct);
            catalogDb.KitComponents.RemoveRange(existing);
            foreach (var e in entries)
                catalogDb.KitComponents.Add(new Catalog.Infrastructure.KitComponent(
                    tenant.TenantId.Value, variantId, e.ComponentVariantId, e.Quantity));
            await catalogDb.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        // ---- Escáner: buscar variante por código de barras o SKU ----
        // Lo usa el depósito (buscar/ajustar/picking); permiso de inventario
        // explícito porque los GET del grupo son públicos.
        products.MapGet("/by-code/{code}", async (
            string code, HttpContext http, ITenantContext tenant,
            Catalog.Infrastructure.Persistence.CatalogDbContext catalogDb,
            Inventory.Core.Domain.IStockRepository stock, CancellationToken ct) =>
        {
            if (await AuthExtensions.CheckPermissionAsync(http, Permission.InventoryRead) is { } denied) return denied;
            var needle = code.Trim();
            if (needle.Length == 0) return Results.NotFound();

            var product = await catalogDb.Products.AsNoTracking()
                .FirstOrDefaultAsync(p => p.TenantId == tenant.TenantId
                    && p.Variants.Any(v => v.Barcode == needle || v.Sku == needle), ct);
            var variant = product?.Variants.FirstOrDefault(v => v.Barcode == needle || v.Sku == needle);
            if (product is null || variant is null) return Results.NotFound();

            var stockRows = await stock.GetByVariantsAsync(tenant.TenantId, [variant.Id], ct);
            var stockItem = stockRows.Count > 0 ? stockRows[0] : null;
            return Results.Ok(new
            {
                productId = product.Id,
                productName = product.Name,
                imageUrl = product.Images.OrderBy(i => i.Position).FirstOrDefault()?.Url,
                variantId = variant.Id,
                sku = variant.Sku,
                barcode = variant.Barcode,
                description = variant.OptionValues.Count > 0 ? string.Join(" / ", variant.OptionValues) : "Única",
                priceAmount = variant.Price.AmountInMinorUnits,
                available = stockItem?.Available ?? 0,
                reserved = stockItem?.Reserved ?? 0,
                location = stockItem?.Location,
            });
        });

        // ---- Etiquetas QR imprimibles (plancha A4) ----
        products.MapGet("/labels", async (
            string variantIds, ITenantContext tenant,
            Catalog.Infrastructure.Persistence.CatalogDbContext catalogDb, CancellationToken ct) =>
        {
            var ids = variantIds.Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Select(s => Guid.TryParse(s.Trim(), out var g) ? g : Guid.Empty)
                .Where(g => g != Guid.Empty).Take(240).ToHashSet();
            if (ids.Count == 0) return Results.BadRequest();

            // Query directa por las variantes pedidas: cargar el catálogo entero
            // (con imágenes y opciones) para imprimir ≤240 etiquetas no escala.
            var all = await catalogDb.Products.AsNoTracking()
                .Where(p => p.TenantId == tenant.TenantId && p.Variants.Any(v => ids.Contains(v.Id)))
                .ToListAsync(ct);
            var labels = all
                .SelectMany(p => p.Variants
                    .Where(v => ids.Contains(v.Id))
                    .Select(v => new VariantLabel(
                        p.Name,
                        v.OptionValues.Count > 0 ? string.Join(" / ", v.OptionValues) : "",
                        v.Sku,
                        v.Barcode ?? v.Sku,
                        v.Price.AmountInMinorUnits)))
                .ToList();
            if (labels.Count == 0) return Results.NotFound();

            var pdf = VariantLabelsPdf.Render(labels);
            return Results.File(pdf, "application/pdf", "etiquetas.pdf");
        }).RequireTenantMembership();

        // Asignar el código escaneado a una variante (flujo del Escáner:
        // "EAN desconocido → buscá por SKU → asignar").
        products.MapPut("/{id:guid}/variants/{variantId:guid}/barcode", async (
            Guid id, Guid variantId, SetBarcodeRequest request, HttpContext http, ITenantContext tenant,
            UpdateProductHandler handler, CancellationToken ct) =>
        {
            if (await AuthExtensions.CheckPermissionAsync(http, Permission.CatalogWrite) is { } denied) return denied;
            var result = await handler.SetVariantBarcodeAsync(tenant.TenantId, id, variantId, request.Barcode, ct);
            return result.IsSuccess ? Results.NoContent() : result.Error.ToProblem();
        });

        // Costo sugerido de un kit: la suma del costo de sus componentes por
        // cantidad. Sin esto, el costo del combo era un número a mano y la
        // rentabilidad de los kits dependía de que alguien hiciera la cuenta.
        products.MapGet("/kits/suggested-costs", async (
            HttpContext http, ITenantContext tenant,
            Catalog.Infrastructure.Persistence.CatalogDbContext catalogDb, CancellationToken ct) =>
        {
            if (await AuthExtensions.CheckPermissionAsync(http, Permission.CatalogWrite) is { } denied) return denied;

            var components = await catalogDb.KitComponents.AsNoTracking().ToListAsync(ct);
            if (components.Count == 0) return Results.Ok(new { items = Array.Empty<object>() });

            var neededIds = components.Select(c => c.ComponentVariantId).Distinct().ToList();
            var costByVariant = (await catalogDb.Products.AsNoTracking()
                    .Where(p => p.TenantId == tenant.TenantId && p.Variants.Any(v => neededIds.Contains(v.Id)))
                    .ToListAsync(ct))
                .SelectMany(p => p.Variants)
                .Where(v => v.Cost is not null)
                .ToDictionary(v => v.Id, v => v.Cost!.Value.AmountInMinorUnits);

            var items = components
                .GroupBy(c => c.KitVariantId)
                .Select(g => new
                {
                    kitVariantId = g.Key,
                    // null = falta el costo de algún componente (no se puede sumar).
                    suggestedCostMinor = g.All(c => costByVariant.ContainsKey(c.ComponentVariantId))
                        ? g.Sum(c => costByVariant[c.ComponentVariantId] * c.Quantity)
                        : (long?)null,
                })
                .ToList();
            return Results.Ok(new { items });
        });

        // ---- Repreciación masiva ----
        // Llegó el contenedor con dólar nuevo: +X% a todo (o a una categoría)
        // con redondeo comercial, en un click — no variante por variante.
        products.MapPost("/reprice", async (
            RepriceRequest request, HttpContext http, ITenantContext tenant,
            IProductRepository repository, UpdateProductHandler handler, CancellationToken ct) =>
        {
            if (await AuthExtensions.CheckPermissionAsync(http, Permission.CatalogWrite) is { } denied) return denied;
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
            Guid id, HttpContext http, ITenantContext tenant, IProductRepository repository, CancellationToken ct) =>
        {
            if (await AuthExtensions.CheckPermissionAsync(http, Permission.CatalogWrite) is { } denied) return denied;
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
        });

        // Bulk para la pantalla de Costos: los costos de una página entera de
        // productos en UN request (antes: un GET por producto visible).
        products.MapGet("/costs", async (
            string? ids, HttpContext http, ITenantContext tenant,
            Catalog.Infrastructure.Persistence.CatalogDbContext catalogDb, CancellationToken ct) =>
        {
            if (await AuthExtensions.CheckPermissionAsync(http, Permission.CatalogWrite) is { } denied) return denied;
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
        });

        products.MapPut("/{id:guid}/costs", async (
            Guid id, SetVariantCostsRequest request, HttpContext http, ITenantContext tenant,
            UpdateProductHandler handler, CancellationToken ct) =>
        {
            if (await AuthExtensions.CheckPermissionAsync(http, Permission.CatalogWrite) is { } denied) return denied;
            var costs = (request.Costs ?? []).Select(c => (c.VariantId, c.CostAmount)).ToList();
            var result = await handler.SetVariantCostsAsync(
                new SetVariantCostsCommand(tenant.TenantId, id, costs, request.Currency ?? Money.DefaultCurrency), ct);
            return result.IsSuccess ? Results.NoContent() : result.Error.ToProblem();
        });

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
        Results.BadRequest(new { error = "Se espera multipart/form-data." });
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
