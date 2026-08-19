using System.Text.RegularExpressions;
using Catalog.Core.Domain;
using Catalog.Infrastructure.Persistence;
using Media.Infrastructure;
using SharedKernel.Common;

namespace Api.Import;

/// <summary>
/// Consume jobs de importación de imágenes. Matchea cada archivo a un producto
/// por el nombre = Identificador de URL (slug), con fallback a SKU; el sufijo
/// "-N" ordena la galería. Sube a MinIO/S3 y linkea como imagen del producto.
/// </summary>
public sealed partial class ProductImageImportWorker(
    ImageImportQueue queue,
    IServiceScopeFactory scopeFactory,
    IMediaStorage media,
    ILogger<ProductImageImportWorker> logger) : ImportQueueWorker<ImageImportJob>(queue, logger)
{

    [GeneratedRegex(@"^(.*)-(\d+)$")]
    private static partial Regex SuffixRegex();

    /// <summary>Los archivos subidos se borran del disco pase lo que pase.</summary>
    protected override void OnFinished(ImageImportJob job) => TryCleanup(job.TempDir);

    protected override async Task ProcessJobAsync(ImageImportJob job, CancellationToken ct)
    {
        job.Status = ImportStatus.Processing;
        var tenant = TenantId.From(job.TenantId);

        // Mapas slug→productId y sku→productId (una pasada por el catálogo).
        var (bySlug, bySku) = await BuildLookupAsync(tenant, ct);

        // Agrupar los archivos por producto, con su posición de galería.
        var files = Directory.EnumerateFiles(job.TempDir)
            .Where(f => ImportMedia.ImageExtensions.Contains(Path.GetExtension(f)))
            .ToList();
        job.TotalFiles = files.Count;

        var byProduct = new Dictionary<Guid, List<(int Pos, string Path)>>();
        var mappingPath = Path.Combine(job.TempDir, "__mapping.csv");

        if (File.Exists(mappingPath))
        {
            // Con CSV de mapeo: asociación EXACTA por handle → archivos (sin adivinar).
            BuildFromMapping(mappingPath, job.TempDir, bySlug, byProduct, job);
        }
        else
        {
            // Sin mapeo: matchear por nombre de archivo = slug (con sufijo -N), fallback SKU.
            foreach (var file in files)
            {
                var name = Path.GetFileNameWithoutExtension(file).ToLowerInvariant();
                var match = Resolve(name, bySlug, bySku);
                if (match is null)
                {
                    job.AddUnmatched(Path.GetFileName(file));
                    job.Processed++;
                    continue;
                }

                var (productId, pos) = match.Value;
                if (!byProduct.TryGetValue(productId, out var list))
                    byProduct[productId] = list = [];
                list.Add((pos, file));
            }
        }

        logger.LogInformation("Import imágenes {JobId}: {Files} archivos → {Products} productos",
            job.Id, files.Count, byProduct.Count);

        foreach (var (productId, items) in byProduct)
        {
            ct.ThrowIfCancellationRequested();
            try
            {
                using var scope = scopeFactory.CreateScope();
                var repo = scope.ServiceProvider.GetRequiredService<IProductRepository>();
                var db = scope.ServiceProvider.GetRequiredService<CatalogDbContext>();
                var added = await AttachImagesAsync(tenant, productId, items, repo, db, ct);
                if (added > 0) job.MatchedProducts++;
                job.ImagesAdded += added;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Import imágenes {JobId}: producto {ProductId} falló", job.Id, productId);
            }
            job.Processed += items.Count;
        }

        job.Status = ImportStatus.Completed;
        job.FinishedAtUtc = DateTime.UtcNow;
        logger.LogInformation("Import imágenes {JobId} listo: {Images} imágenes en {Products} productos, {Unmatched} sin match",
            job.Id, job.ImagesAdded, job.MatchedProducts, job.UnmatchedFiles);
    }

    private async Task<int> AttachImagesAsync(
        TenantId tenant, Guid productId, List<(int Pos, string Path)> items,
        IProductRepository repo, CatalogDbContext db, CancellationToken ct)
    {
        var product = await repo.GetByIdAsync(tenant, productId, ct);
        if (product is null) return 0;

        // Subir primero; recién si hay alguna OK reemplazamos la galería.
        var urls = new List<string>();
        foreach (var (_, path) in items.OrderBy(i => i.Pos))
        {
            if (urls.Count >= Product.MaxImages) break;

            var contentType = ContentTypeFor(path);
            if (contentType is null) continue;

            await using var stream = File.OpenRead(path);
            var upload = await media.UploadAsync(tenant.Value, stream, contentType, stream.Length, ct);
            if (upload.IsSuccess) urls.Add(upload.Value);
        }

        if (urls.Count == 0) return 0;

        // Reemplazo: la galería pasa a ser EXACTAMENTE estos archivos. Re-importar
        // es idempotente (no acumula duplicados como antes).
        product.ClearImages();
        var added = 0;
        foreach (var url in urls)
            if (product.AddImage(url, null).IsSuccess) added++;

        await db.SaveChangesAsync(ct);
        return added;
    }

    private async Task<(Dictionary<string, Guid> BySlug, Dictionary<string, Guid> BySku)> BuildLookupAsync(
        TenantId tenant, CancellationToken ct)
    {
        var bySlug = new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase);
        var bySku = new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase);

        using var scope = scopeFactory.CreateScope();
        var repo = scope.ServiceProvider.GetRequiredService<IProductRepository>();

        Guid? after = null;
        while (true)
        {
            var page = await repo.ListAsync(tenant, null, 100, after, ct);
            foreach (var p in page)
            {
                bySlug.TryAdd(p.Slug.Value, p.Id);
                foreach (var v in p.Variants)
                    bySku.TryAdd(v.Sku, p.Id);
            }
            if (page.Count < 100) break;
            after = page[^1].Id;
        }

        return (bySlug, bySku);
    }

    /// <summary>Agrupa archivos por producto usando el CSV de mapeo (handle → "Archivos").</summary>
    private void BuildFromMapping(
        string mappingPath, string tempDir, Dictionary<string, Guid> bySlug,
        Dictionary<Guid, List<(int Pos, string Path)>> byProduct, ImageImportJob job)
    {
        var (headers, rows) = ProductCsv.Parse(File.ReadAllText(mappingPath));
        var iHandle = headers.FindIndex(h => h.Contains("identificador", StringComparison.OrdinalIgnoreCase));
        var iFiles = headers.FindIndex(h => h.Contains("archivo", StringComparison.OrdinalIgnoreCase));
        if (iHandle < 0 || iFiles < 0)
        {
            logger.LogWarning("Mapeo {Path}: sin columnas 'Identificador de URL' / 'Archivos'", mappingPath);
            return;
        }

        foreach (var row in rows)
        {
            if (row.Count <= Math.Max(iHandle, iFiles)) continue;
            var handle = row[iHandle].Trim();
            if (!bySlug.TryGetValue(handle, out var productId)) continue;

            var fileNames = row[iFiles].Split('|', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            var pos = 1;
            foreach (var f in fileNames)
            {
                var path = Path.Combine(tempDir, Path.GetFileName(f));
                if (ImportMedia.ImageExtensions.Contains(Path.GetExtension(f)) && File.Exists(path))
                {
                    if (!byProduct.TryGetValue(productId, out var list))
                        byProduct[productId] = list = [];
                    list.Add((pos++, path));
                }
                else
                {
                    job.AddUnmatched(f);
                }
            }
        }
    }

    /// <summary>Resuelve archivo → (productId, posición). Slug exacto, luego sin sufijo, luego SKU.</summary>
    private static (Guid ProductId, int Pos)? Resolve(
        string name, Dictionary<string, Guid> bySlug, Dictionary<string, Guid> bySku)
    {
        // 1) Match exacto por slug (cubre slugs que terminan en número).
        if (bySlug.TryGetValue(name, out var exact)) return (exact, 1);

        // 2) Sacar sufijo "-N" y reintentar SOLO contra slugs; N = posición.
        // (No caemos a SKU acá: era la fuente de matches cruzados a productos ajenos.)
        var m = SuffixRegex().Match(name);
        if (m.Success && bySlug.TryGetValue(m.Groups[1].Value, out var bySlugBase))
            return (bySlugBase, int.TryParse(m.Groups[2].Value, out var n) ? n : 1);

        // 3) SKU exacto (sin sufijo) como último recurso.
        if (bySku.TryGetValue(name, out var sku)) return (sku, 1);

        return null;
    }

    private static string? ContentTypeFor(string path) =>
        Path.GetExtension(path).ToLowerInvariant() switch
        {
            ".png" => "image/png",
            ".webp" => "image/webp",
            ".avif" => "image/avif",
            ".jpg" or ".jpeg" => "image/jpeg",
            _ => null,
        };

    private void TryCleanup(string dir)
    {
        try { if (Directory.Exists(dir)) Directory.Delete(dir, recursive: true); }
        catch (Exception ex) { logger.LogWarning(ex, "No pude limpiar {Dir}", dir); }
    }
}
