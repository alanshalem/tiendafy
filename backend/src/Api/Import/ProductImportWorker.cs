using Api.Storefront;
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
    MediaOptions mediaOptions,
    IHttpClientFactory httpFactory,
    IStorefrontRevalidator storefront,
    ILogger<ProductImportWorker> logger) : ImportQueueWorker<ImportJob>(queue, logger)
{
    protected override async Task ProcessJobAsync(ImportJob job, CancellationToken ct)
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
        // El endpoint que encoló el CSV ya avisó, pero antes de que se cargara nada.
        _ = storefront.RevalidateAsync(job.TenantId, StorefrontScope.Catalog, StorefrontScope.Categories);
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
            var (price, compareAt, cost) = BuildPrice(iv.PriceMinor ?? 0, iv);

            var vr = product.AddVariant(sku, iv.OptionValues, price, compareAt, cost);
            if (vr.IsFailure)
                job.AddError(iv.Line, model.Handle, $"Variante '{sku}': {vr.Error.Message}");
            else
            {
                if (iv.Barcode is not null) product.SetVariantBarcode(vr.Value.Id, iv.Barcode);
                ApplyShipping(product, vr.Value.Id, iv, model.Handle, job);
                addedVariants++;
            }
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
        // Al modificar, una celda vacía (o una columna que el archivo no trae)
        // no toca ese dato: así, importar lo recién exportado no cambia nada, y
        // una planilla con solo precios no borra descripciones ni marcas.
        product.UpdateDetails(
            string.IsNullOrWhiteSpace(model.Name) ? product.Name : model.Name,
            model.Description ?? product.Description);
        if (model.Brand is not null) product.SetBrand(model.Brand);
        if (model.SeoTitle is not null || model.SeoDescription is not null)
            product.SetSeo(model.SeoTitle ?? product.SeoTitle, model.SeoDescription ?? product.SeoDescription);

        var categoryIds = await resolver.ResolveAsync(model.Categories, ct);
        if (categoryIds.Count > 0) product.SetCategories(categoryIds);

        foreach (var iv in model.Variants)
        {
            if (string.IsNullOrWhiteSpace(iv.Sku)) continue;
            var match = MatchBySku(product, iv.Sku, blankFallback: false);
            if (match is null) continue;

            // "Precio" vacío = no tocar los precios. Sin la columna "Precio
            // promocional", la oferta vigente sigue mientras quede por arriba.
            if (iv.PriceMinor is { } priceMinor)
            {
                var (price, compareAt, _) = model.HasCompareAtColumn
                    ? BuildPrice(priceMinor, iv)
                    : BuildPrice(priceMinor, iv, keepCompareAt: match.CompareAtPrice);
                product.ChangeVariantPrice(match.Id, price, compareAt);
            }
            // Celda "Costo" vacía = no tocar el costo existente (CSVs viejos sin la columna).
            var cost = BuildCost(iv);
            if (cost is not null) product.SetVariantCost(match.Id, cost);
            if (iv.Barcode is not null) product.SetVariantBarcode(match.Id, iv.Barcode);
            // Celdas de peso y medidas vacías = no tocar lo cargado.
            ApplyShipping(product, match.Id, iv, model.Handle, job);
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
            var match = MatchBySku(product, iv.Sku, blankFallback: true);
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
    /// <summary>
    /// Peso y medidas del paquete de una unidad, de la planilla. Lo que viene
    /// vacío no pisa lo cargado; las medidas valen las tres juntas.
    /// </summary>
    private static void ApplyShipping(Product product, Guid variantId, ImportVariant iv, string handle, ImportJob job)
    {
        if (!iv.HasShipping) return;
        var current = product.Variants.First(v => v.Id == variantId);
        var hasSize = iv.LengthCm is not null || iv.WidthCm is not null || iv.HeightCm is not null;
        var result = product.SetVariantShipping(variantId,
            iv.WeightGrams ?? current.WeightGrams,
            hasSize ? iv.LengthCm : current.LengthCm,
            hasSize ? iv.WidthCm : current.WidthCm,
            hasSize ? iv.HeightCm : current.HeightCm);
        if (result.IsFailure)
            job.AddError(iv.Line, handle, $"Variante '{iv.Sku}': {result.Error.Message}");
    }

    private static (long Price, long? Compare) NormalizePrice(long precio, long? promo)
    {
        if (promo is not { } p || p == precio) return (precio, null);
        return (Math.Min(precio, p), Math.Max(precio, p));
    }

    /// <summary>
    /// Precio + promocional del CSV → Money (moneda por defecto del import).
    /// Con <paramref name="keepCompareAt"/> (archivo sin la columna "Precio
    /// promocional"), el precio de la planilla es el que se cobra y el tachado
    /// vigente queda si sigue siendo mayor.
    /// </summary>
    private static (Money Price, Money? CompareAt, Money? Cost) BuildPrice(
        long priceFromFile, ImportVariant iv, Money? keepCompareAt = null)
    {
        Money price;
        Money? compareAt;
        if (keepCompareAt is { } kept)
        {
            price = new Money(priceFromFile, ProductCsv.Currency);
            compareAt = kept.AmountInMinorUnits > priceFromFile ? kept : null;
        }
        else
        {
            var (priceMinor, compareMinor) = NormalizePrice(priceFromFile, iv.CompareAtMinor);
            price = new Money(priceMinor, ProductCsv.Currency);
            compareAt = compareMinor.HasValue ? new Money(compareMinor.Value, ProductCsv.Currency) : null;
        }
        return (price, compareAt, BuildCost(iv));
    }

    private static Money? BuildCost(ImportVariant iv) =>
        iv.CostMinor is { } costMinor and >= 0 ? new Money(costMinor, ProductCsv.Currency) : null;

    /// <summary>
    /// Busca la variante cuyo SKU coincide (case-insensitive). Con <paramref name="blankFallback"/>
    /// true, un SKU vacío en el CSV matchea la variante (misma semántica que el apply de stock).
    /// </summary>
    private static Variant? MatchBySku(Product product, string sku, bool blankFallback) =>
        product.Variants.FirstOrDefault(v => string.Equals(
            v.Sku, blankFallback && string.IsNullOrWhiteSpace(sku) ? v.Sku : sku, StringComparison.OrdinalIgnoreCase));

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
            if (!await PublicUrlGuard.IsFetchableAsync(src, ct)) return null;

            var http = httpFactory.CreateClient(PublicUrlGuard.HttpClientName);
            http.Timeout = TimeSpan.FromSeconds(20);
            // El Timeout del cliente llega hasta los encabezados; este cubre
            // también el cuerpo, que puede venir de a gotas.
            using var download = CancellationTokenSource.CreateLinkedTokenSource(ct);
            download.CancelAfter(TimeSpan.FromSeconds(30));

            // Solo los encabezados: el cuerpo se lee después, con tope. Antes se
            // leía entero a memoria, y una URL de la planilla que devolviera
            // gigas (o no terminara nunca) se comía la RAM del servidor.
            using var resp = await http.GetAsync(src, HttpCompletionOption.ResponseHeadersRead, download.Token);
            if (!resp.IsSuccessStatusCode) return Fallback(tenantId, src);
            if (resp.Content.Headers.ContentLength > S3MediaStorage.MaxImageBytes) return Fallback(tenantId, src);

            var contentType = resp.Content.Headers.ContentType?.MediaType ?? GuessContentType(src);
            if (contentType == "image/jpg") contentType = "image/jpeg";

            // El largo declarado no se cree: se cuenta lo que llega y se corta al pasarse.
            using var ms = new MemoryStream();
            await using (var body = await resp.Content.ReadAsStreamAsync(download.Token))
            {
                if (await ProductImportEndpointHelpers.CopyCappedAsync(body, ms, S3MediaStorage.MaxImageBytes, download.Token) is null)
                    return Fallback(tenantId, src);
            }
            ms.Position = 0;

            var upload = await media.UploadAsync(tenantId, ms, contentType, ms.Length, ct);
            return upload.IsSuccess ? upload.Value : Fallback(tenantId, src);
        }
        catch
        {
            return Fallback(tenantId, src);
        }
    }

    /// <summary>
    /// La URL original, si sirve como foto. Nunca la de un objeto de nuestro
    /// bucket de otra tienda: esa foto no es de esta tienda.
    /// </summary>
    private string? Fallback(Guid tenantId, string src) =>
        Uri.IsWellFormedUriString(src, UriKind.Absolute) && src.Length is >= 10 and <= 500
            && !mediaOptions.IsForeignMedia(tenantId, src)
            ? src
            : null;

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
