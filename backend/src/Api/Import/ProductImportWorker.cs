using System.Net;
using System.Net.Sockets;
using Catalog.Core.Domain;
using Catalog.Infrastructure.Persistence;
using Inventory.Core.Domain;
using Media.Infrastructure;
using SharedKernel.Common;

namespace Api.Import;

/// <summary>
/// Consume jobs de importación de la cola y los procesa fila por fila.
/// Un scope de DI por producto (DbContext fresco, sin bloat de tracking).
/// Las imágenes referenciadas por URL se descargan y re-hospedan en nuestro
/// storage (MinIO/S3); si falla la descarga, se guarda la URL original.
/// </summary>
public sealed class ProductImportWorker(
    ProductImportQueue queue,
    IServiceScopeFactory scopeFactory,
    IMediaStorage media,
    IHttpClientFactory httpFactory,
    ILogger<ProductImportWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var jobId in queue.Reader.ReadAllAsync(stoppingToken))
        {
            var job = queue.Get(jobId);
            if (job is null) continue;

            try
            {
                await ProcessJobAsync(job, stoppingToken);
            }
            catch (Exception ex)
            {
                job.Status = ImportStatus.Failed;
                // No exponemos ex.Message al cliente (puede filtrar detalles internos);
                // el stack completo queda en el log del servidor.
                job.FailureMessage = "La importación falló por un error inesperado.";
                job.FinishedAtUtc = DateTime.UtcNow;
                logger.LogError(ex, "Importación {JobId} falló", job.Id);
            }
        }
    }

    private async Task ProcessJobAsync(ImportJob job, CancellationToken ct)
    {
        job.Status = ImportStatus.Processing;
        var tenant = TenantId.From(job.TenantId);
        var models = ProductCsv.MapProducts(job.Csv);
        job.TotalProducts = models.Count;

        logger.LogInformation("Importación {JobId}: {Count} productos", job.Id, models.Count);

        // Resolver de categorías con scope propio para toda la corrida: cachea
        // el árbol y crea las que falten una sola vez.
        using var catScope = scopeFactory.CreateScope();
        var resolver = await CategoryResolver.CreateAsync(
            catScope.ServiceProvider.GetRequiredService<ICategoryRepository>(),
            catScope.ServiceProvider.GetRequiredService<CatalogDbContext>(),
            tenant, ct);

        foreach (var model in models)
        {
            ct.ThrowIfCancellationRequested();
            try
            {
                using var scope = scopeFactory.CreateScope();
                var repo = scope.ServiceProvider.GetRequiredService<IProductRepository>();
                var db = scope.ServiceProvider.GetRequiredService<CatalogDbContext>();
                var stock = scope.ServiceProvider.GetRequiredService<IStockRepository>();
                await ProcessProductAsync(model, tenant, job, repo, db, stock, resolver, ct);
            }
            catch (Exception ex)
            {
                job.AddError(model.Line, model.Handle, ex.Message);
                logger.LogWarning(ex, "Importación {JobId}: fila {Line} ({Handle}) falló",
                    job.Id, model.Line, model.Handle);
            }
            job.Processed++;
        }

        job.Status = ImportStatus.Completed;
        job.FinishedAtUtc = DateTime.UtcNow;
        logger.LogInformation(
            "Importación {JobId} lista: +{Created} ~{Updated} ={Skipped} ✗{Errors}",
            job.Id, job.Created, job.Updated, job.Skipped, job.ErrorCount);
    }

    private async Task ProcessProductAsync(
        ImportProduct model, TenantId tenant, ImportJob job,
        IProductRepository repo, CatalogDbContext db, IStockRepository stock,
        CategoryResolver resolver, CancellationToken ct)
    {
        var desired = !string.IsNullOrWhiteSpace(model.Handle) ? model.Handle : model.Name;
        var slugResult = Slug.Create(desired);
        var slugStr = slugResult.IsSuccess ? slugResult.Value.Value : null;

        var existing = slugStr is not null
            ? await repo.GetBySlugAsync(tenant, slugStr, ct)
            : null;

        if (existing is not null)
        {
            if (!job.Options.UpdateExisting)
            {
                job.Skipped++;
                return;
            }
            await UpdateProductAsync(model, existing, tenant, job, db, stock, resolver, ct);
            job.Updated++;
            return;
        }

        await CreateProductAsync(model, slugResult.IsSuccess ? slugResult.Value : null, tenant, job, repo, db, stock, resolver, ct);
        job.Created++;
    }

    private async Task CreateProductAsync(
        ImportProduct model, Slug? slug, TenantId tenant, ImportJob job,
        IProductRepository repo, CatalogDbContext db, IStockRepository stock,
        CategoryResolver resolver, CancellationToken ct)
    {
        var created = Product.Create(tenant, model.Name, model.Description);
        if (created.IsFailure)
            throw new InvalidOperationException(created.Error.Message);

        var product = created.Value;
        if (slug is not null)
            product.OverrideSlug(slug);

        // Colisión defensiva (handle vacío → slug del nombre puede chocar).
        if (await repo.SlugExistsAsync(tenant, product.Slug.Value, ct))
            await ResolveSlugCollisionAsync(product, repo, tenant, ct);

        foreach (var option in model.Options)
        {
            var r = product.AddOption(option.Name, option.Values);
            if (r.IsFailure) job.AddError(model.Line, model.Handle, $"Opción '{option.Name}': {r.Error.Message}");
        }

        var addedVariants = 0;
        for (var i = 0; i < model.Variants.Count; i++)
        {
            var iv = model.Variants[i];
            var sku = string.IsNullOrWhiteSpace(iv.Sku) ? GenerateSku(product.Slug.Value, i) : iv.Sku;
            var (priceMinor, compareMinor) = NormalizePrice(iv.PriceMinor, iv.CompareAtMinor);
            var price = new Money(priceMinor, ProductCsv.Currency);
            Money? compareAt = compareMinor.HasValue ? new Money(compareMinor.Value, ProductCsv.Currency) : null;

            var vr = product.AddVariant(sku, iv.OptionValues, price, compareAt);
            if (vr.IsFailure)
                job.AddError(iv.Line, model.Handle, $"Variante '{sku}': {vr.Error.Message}");
            else
                addedVariants++;
        }

        if (model.Visible && addedVariants > 0)
        {
            var pub = product.Publish();
            if (pub.IsFailure) job.AddError(model.Line, model.Handle, pub.Error.Message);
        }

        foreach (var src in model.ImageUrls)
        {
            var url = await ResolveImageAsync(tenant.Value, src, ct);
            if (url is null) continue;
            var img = product.AddImage(url, null);
            if (img.IsSuccess) job.ImagesImported++;
        }

        var categoryIds = await resolver.ResolveAsync(model.Categories, ct);
        if (categoryIds.Count > 0) product.SetCategories(categoryIds);
        product.SetBrand(model.Brand);
        product.SetSeo(model.SeoTitle, model.SeoDescription);

        await repo.AddAsync(product, ct);
        await db.SaveChangesAsync(ct);

        if (job.Options.UpdateStock)
            await ApplyStockAsync(model, product, tenant, stock, ct);
    }

    private async Task UpdateProductAsync(
        ImportProduct model, Product product, TenantId tenant, ImportJob job,
        CatalogDbContext db, IStockRepository stock, CategoryResolver resolver, CancellationToken ct)
    {
        product.UpdateDetails(model.Name, model.Description);
        product.SetBrand(model.Brand);

        var categoryIds = await resolver.ResolveAsync(model.Categories, ct);
        if (categoryIds.Count > 0) product.SetCategories(categoryIds);

        foreach (var iv in model.Variants)
        {
            if (string.IsNullOrWhiteSpace(iv.Sku)) continue;
            var match = product.Variants.FirstOrDefault(v =>
                string.Equals(v.Sku, iv.Sku, StringComparison.OrdinalIgnoreCase));
            if (match is null) continue;

            var (priceMinor, compareMinor) = NormalizePrice(iv.PriceMinor, iv.CompareAtMinor);
            var price = new Money(priceMinor, ProductCsv.Currency);
            Money? compareAt = compareMinor.HasValue ? new Money(compareMinor.Value, ProductCsv.Currency) : null;
            product.ChangeVariantPrice(match.Id, price, compareAt);
        }

        await db.SaveChangesAsync(ct);

        if (job.Options.UpdateStock)
            await ApplyStockAsync(model, product, tenant, stock, ct);
    }

    private async Task ApplyStockAsync(
        ImportProduct model, Product product, TenantId tenant, IStockRepository stock, CancellationToken ct)
    {
        foreach (var iv in model.Variants)
        {
            if (iv.Stock is not { } qty) continue;
            var match = product.Variants.FirstOrDefault(v =>
                string.Equals(v.Sku, string.IsNullOrWhiteSpace(iv.Sku) ? v.Sku : iv.Sku, StringComparison.OrdinalIgnoreCase));
            if (match is null) continue;
            await stock.SetAvailableAsync(tenant, match.Id, qty, "Importación CSV", ct);
        }
    }

    private static async Task ResolveSlugCollisionAsync(
        Product product, IProductRepository repo, TenantId tenant, CancellationToken ct)
    {
        var baseSlug = product.Slug.Value;
        for (var i = 2; i <= 50; i++)
        {
            var candidate = Slug.Create($"{baseSlug}-{i}");
            if (candidate.IsFailure) break;
            if (!await repo.SlugExistsAsync(tenant, candidate.Value.Value, ct))
            {
                product.OverrideSlug(candidate.Value);
                return;
            }
        }
        // Último recurso: sufijo aleatorio corto.
        var rnd = Slug.Create($"{baseSlug}-{Guid.NewGuid():N}"[..Math.Min(baseSlug.Length + 9, 60)]);
        if (rnd.IsSuccess) product.OverrideSlug(rnd.Value);
    }

    /// <summary>
    /// Normaliza precio/promocional del CSV: se cobra el menor y se tacha el mayor.
    /// (Tiendanube: "Promocional" es la oferta; el scraping a veces los manda invertidos.)
    /// </summary>
    private static (long Price, long? Compare) NormalizePrice(long precio, long? promo)
    {
        if (promo is not { } p || p == precio) return (precio, null);
        return (Math.Min(precio, p), Math.Max(precio, p));
    }

    private static string GenerateSku(string slug, int index)
    {
        var prefix = slug.ToUpperInvariant();
        var sku = index == 0 ? prefix : $"{prefix}-{index + 1}";
        return sku.Length <= 64 ? sku : sku[..64];
    }

    /// <summary>
    /// Descarga la imagen y la sube a nuestro storage; devuelve la URL propia.
    /// Si algo falla, cae a la URL original (si es válida). null = imagen descartada.
    /// </summary>
    private async Task<string?> ResolveImageAsync(Guid tenantId, string src, CancellationToken ct)
    {
        try
        {
            // Anti-SSRF: solo http(s) a hosts públicos. Bloquea metadata de cloud
            // (169.254.169.254), loopback y rangos privados de la red interna.
            if (!await IsFetchablePublicUrlAsync(src, ct)) return null;

            var http = httpFactory.CreateClient();
            http.Timeout = TimeSpan.FromSeconds(20);

            using var resp = await http.GetAsync(src, ct);
            if (!resp.IsSuccessStatusCode) return Fallback(src);

            var contentType = resp.Content.Headers.ContentType?.MediaType ?? GuessContentType(src);
            if (contentType == "image/jpg") contentType = "image/jpeg";

            var bytes = await resp.Content.ReadAsByteArrayAsync(ct);
            using var ms = new MemoryStream(bytes);

            var upload = await media.UploadAsync(tenantId, ms, contentType, bytes.Length, ct);
            return upload.IsSuccess ? upload.Value : Fallback(src);
        }
        catch
        {
            return Fallback(src);
        }
    }

    private static string? Fallback(string src) =>
        Uri.IsWellFormedUriString(src, UriKind.Absolute) && src.Length is >= 10 and <= 500 ? src : null;

    /// <summary>
    /// Valida que la URL sea http(s) y resuelva a una IP pública. Defensa anti-SSRF
    /// para la descarga de imágenes del CSV (input controlado por el merchant).
    /// </summary>
    private static async Task<bool> IsFetchablePublicUrlAsync(string url, CancellationToken ct)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var u)) return false;
        if (u.Scheme != Uri.UriSchemeHttp && u.Scheme != Uri.UriSchemeHttps) return false;
        try
        {
            var addresses = await Dns.GetHostAddressesAsync(u.DnsSafeHost, ct);
            if (addresses.Length == 0) return false;
            foreach (var ip in addresses)
                if (IsPrivateOrReserved(ip)) return false;
            return true;
        }
        catch { return false; }
    }

    private static bool IsPrivateOrReserved(IPAddress ip)
    {
        if (IPAddress.IsLoopback(ip)) return true;
        if (ip.AddressFamily == AddressFamily.InterNetwork)
        {
            var b = ip.GetAddressBytes();
            return b[0] == 0                                   // 0.0.0.0/8
                || b[0] == 10                                  // 10/8
                || (b[0] == 172 && b[1] >= 16 && b[1] <= 31)   // 172.16/12
                || (b[0] == 192 && b[1] == 168)                // 192.168/16
                || (b[0] == 169 && b[1] == 254)                // 169.254/16 link-local (cloud metadata)
                || b[0] == 127                                 // loopback
                || b[0] >= 224;                                // multicast/reserved
        }
        if (ip.AddressFamily == AddressFamily.InterNetworkV6)
        {
            if (ip.IsIPv6LinkLocal || ip.IsIPv6SiteLocal || ip.IsIPv6Multicast) return true;
            var b = ip.GetAddressBytes();
            if ((b[0] & 0xFE) == 0xFC) return true;            // fc00::/7 unique-local
            return false;
        }
        return true;
    }

    private static string GuessContentType(string url)
    {
        var ext = Path.GetExtension(new Uri(url).AbsolutePath).ToLowerInvariant();
        return ext switch
        {
            ".png" => "image/png",
            ".webp" => "image/webp",
            ".avif" => "image/avif",
            _ => "image/jpeg",
        };
    }
}
