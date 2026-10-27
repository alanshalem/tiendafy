using Api.Auth;
using Api.Import;
using Catalog.Core.Domain;
using Identity.Infrastructure;
using Microsoft.AspNetCore.Http.Features;
using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace Api.Endpoints;

public static partial class ProductEndpoints
{
    /// <summary>
    /// Mover el catalogo entero de una: importar un CSV, importar imagenes en
    /// lote, exportar todo. Son los unicos del grupo que trabajan con archivos
    /// y con jobs en background, y por eso estan juntos y aparte.
    /// </summary>
    private static void MapBulk(RouteGroupBuilder products)
    {

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
                return Error.Validation("Import.MissingFile", "Falta el archivo CSV.").ToProblem();

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
        }).RequirePermission(Permission.CatalogWrite);

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

            // Subida grande: cientos/miles de imágenes en un POST. Se levanta el
            // tope de tamaño (default 30MB) y el de partes del multipart
            // (default 1024), pero hasta un límite: sin él, un solo pedido
            // llenaba el disco del servidor.
            var limits = ProductImportEndpointHelpers.ImportLimits.Default;
            var maxBytes = ProductImportEndpointHelpers.ImportLimits.MaxRequestBytes;
            var sizeFeature = req.HttpContext.Features.Get<IHttpMaxRequestBodySizeFeature>();
            if (sizeFeature is { IsReadOnly: false }) sizeFeature.MaxRequestBodySize = maxBytes;
            if (req.ContentLength > maxBytes) return ImageUploadTooLarge();
            req.HttpContext.Features.Set<IFormFeature>(new FormFeature(req, new FormOptions
            {
                ValueCountLimit = limits.MaxEntries,
                MultipartBodyLengthLimit = maxBytes,
            }));

            IFormCollection form;
            try
            {
                form = await req.ReadFormAsync(ct);
            }
            catch (Exception ex) when (ex is InvalidDataException or BadHttpRequestException)
            {
                // Pasó alguno de los topes de arriba mientras llegaba.
                return ImageUploadTooLarge();
            }
            if (form.Files.Count == 0)
                return Error.Validation("Import.NoFiles", "No se subió ninguna imagen.").ToProblem();

            var jobId = Guid.NewGuid();
            var tempDir = Path.Combine(Path.GetTempPath(), "tiendafy-img-import", jobId.ToString("N"));
            Directory.CreateDirectory(tempDir);

            var total = 0;
            var budget = new ProductImportEndpointHelpers.ExtractionBudget(limits);
            foreach (var file in form.Files)
            {
                var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
                if (ext == ".zip")
                {
                    var extracted = await ProductImportEndpointHelpers.ExtractZipAsync(file, tempDir, budget, ct);
                    if (extracted.IsFailure)
                    {
                        try { Directory.Delete(tempDir, true); } catch { /* best effort */ }
                        return extracted.Error.ToProblem();
                    }
                    total += extracted.Value;
                }
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
                return Error.Validation("Import.NoImages", "No se encontraron imágenes (JPG, PNG, WebP o AVIF) ni un ZIP con imágenes.").ToProblem();
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
        }).RequirePermission(Permission.CatalogWrite);

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
        }).RequirePermission(Permission.CatalogWrite);
    }

    private static IResult ImageUploadTooLarge() =>
        Results.Problem(
            title: "Import.TooLarge",
            detail: $"La subida es demasiado grande: el máximo es {ProductImportEndpointHelpers.ImportLimits.MaxRequestBytes / 1024 / 1024 / 1024} GB por vez. Subí las fotos en varias tandas.",
            statusCode: StatusCodes.Status413PayloadTooLarge);
}
