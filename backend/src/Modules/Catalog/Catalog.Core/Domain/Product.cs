using Catalog.Contracts.Events;
using SharedKernel.Common;
using SharedKernel.Domain;
using SharedKernel.Exceptions;

namespace Catalog.Core.Domain;

public enum ProductStatus
{
    Draft = 0,
    Active = 1,
    Archived = 2,
}

/// <summary>Mapeo único ProductStatus ↔ string de API (DRAFT/ACTIVE/ARCHIVED).</summary>
public static class ProductStatusExtensions
{
    public static string ToApiString(this ProductStatus status) => status.ToString().ToUpperInvariant();

    public static ProductStatus? ParseApi(string? raw) => raw?.ToUpperInvariant() switch
    {
        "DRAFT" => ProductStatus.Draft,
        "ACTIVE" => ProductStatus.Active,
        "ARCHIVED" => ProductStatus.Archived,
        _ => null,
    };
}

/// <summary>
/// Aggregate root del catálogo. Invariantes que protege:
/// - Cada variante combina exactamente un valor de cada opción, y la combinación es única.
/// - SKU único dentro del producto (unicidad global por tenant la garantiza el índice de DB).
/// - No se publica sin al menos una variante.
/// </summary>
public sealed class Product : AggregateRoot
{
    public const int MaxOptions = 3;

    public string Name { get; private set; } = null!;
    public Slug Slug { get; private set; } = null!;
    public string? Description { get; private set; }
    public string? SeoTitle { get; private set; }
    public string? SeoDescription { get; private set; }
    /// <summary>Marca del producto (ej: "Royal Canin"). Se usa para filtrar en la tienda.</summary>
    public string? Brand { get; private set; }
    public ProductStatus Status { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }

    private readonly List<ProductOption> _options = [];
    public IReadOnlyList<ProductOption> Options => _options.AsReadOnly();

    private readonly List<Variant> _variants = [];
    /// <summary>
    /// En el orden de las opciones del producto —si el talle es XS, S, M, L,
    /// las variantes salen en ese orden—, venga la consulta que venga.
    ///
    /// Los ids son aleatorios y ninguna consulta ordenaba: el listado las
    /// devolvía en un orden y la ficha en otro, así que la primera variante
    /// (la que la tienda muestra elegida) dependía de por dónde se hubiera
    /// cargado el producto. El orden de los valores de cada opción ya lo
    /// define el comercio: es el único orden con sentido que hay.
    /// </summary>
    public IReadOnlyList<Variant> Variants => [.. _variants.Order(Comparer<Variant>.Create(CompareVariants))];

    private readonly List<ProductImage> _images = [];
    public IReadOnlyList<ProductImage> Images => _images.AsReadOnly();

    // Categorías a las que pertenece (hojas del árbol). Many-to-many liviano:
    // se guarda como uuid[] en la fila del producto. Sin FK de array — la
    // integridad es a nivel app (una categoría borrada deja de matchear).
    private readonly List<Guid> _categoryIds = [];
    public IReadOnlyList<Guid> CategoryIds => _categoryIds.AsReadOnly();

    // Ficha técnica: los valores de este producto para los campos que definió
    // la tienda. Van con el producto y no aparte porque se cargan, se guardan y
    // se muestran junto con él.
    private readonly List<ProductSpec> _specs = [];
    public IReadOnlyList<ProductSpec> Specs => _specs.AsReadOnly();

    private Product() { } // EF Core

    private Product(Guid id, TenantId tenantId, string name, Slug slug, string? description)
        : base(id, tenantId)
    {
        Name = name;
        Slug = slug;
        Description = description;
        Status = ProductStatus.Draft;
        CreatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>
    /// Reemplaza la ficha técnica completa. Se manda todo junto y no campo por
    /// campo: el editor conoce el estado final, y así borrar un valor es
    /// simplemente no mandarlo.
    /// </summary>
    public void SetSpecs(IEnumerable<(Guid DefinitionId, string? Value)> values)
    {
        _specs.Clear();
        foreach (var (definitionId, value) in values)
        {
            if (definitionId == Guid.Empty) continue;
            var spec = ProductSpec.Create(definitionId, value);
            if (spec is not null) _specs.Add(spec);
        }
    }

    public static Result<Product> Create(TenantId tenantId, string? name, string? description = null)
    {
        var trimmed = name?.Trim() ?? string.Empty;
        if (trimmed.Length is < 1 or > 255)
            return Result.Failure<Product>(Error.Validation(
                "Product.InvalidName", "Name must be between 1 and 255 characters."));

        var slugResult = Slug.Create(trimmed);
        if (slugResult.IsFailure)
            return Result.Failure<Product>(slugResult.Error);

        var product = new Product(Guid.NewGuid(), tenantId, trimmed, slugResult.Value, description?.Trim());
        product.RaiseDomainEvent(new ProductCreatedEvent(
            tenantId.Value, product.Id, product.Name, product.Slug.Value));

        return product;
    }

    public Result AddOption(string? name, IEnumerable<string>? values)
    {
        if (_variants.Count > 0)
            return Result.Failure(Error.Conflict(
                "Product.OptionsLocked",
                "Options cannot change once variants exist. Remove variants first."));

        if (_options.Count >= MaxOptions)
            return Result.Failure(Error.Validation(
                "Product.TooManyOptions", $"A product supports at most {MaxOptions} options."));

        var trimmedName = name?.Trim() ?? string.Empty;
        if (trimmedName.Length is < 1 or > 50)
            return Result.Failure(Error.Validation(
                "Product.InvalidOptionName", "Option name must be between 1 and 50 characters."));

        if (_options.Any(o => string.Equals(o.Name, trimmedName, StringComparison.OrdinalIgnoreCase)))
            return Result.Failure(Error.Conflict(
                "Product.DuplicateOption", $"Option '{trimmedName}' already exists."));

        var cleanValues = (values ?? [])
            .Select(v => v.Trim())
            .Where(v => v.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (cleanValues.Count == 0)
            return Result.Failure(Error.Validation(
                "Product.EmptyOptionValues", "An option needs at least one value."));

        _options.Add(new ProductOption(trimmedName, cleanValues));
        return Result.Success();
    }

    /// <summary>
    /// Opción por opción, según el lugar de su valor en la definición; un valor
    /// que no figura va al final. Empate (datos importados sin opciones):
    /// por SKU, y por id para que nunca dependa del orden de la consulta.
    /// </summary>
    private int CompareVariants(Variant a, Variant b)
    {
        for (var i = 0; i < _options.Count; i++)
        {
            var byOption = Rank(i, a).CompareTo(Rank(i, b));
            if (byOption != 0) return byOption;
        }

        var bySku = string.Compare(a.Sku, b.Sku, StringComparison.OrdinalIgnoreCase);
        return bySku != 0 ? bySku : a.Id.CompareTo(b.Id);
    }

    private int Rank(int option, Variant v)
    {
        if (option >= v.OptionValues.Count) return int.MaxValue;
        var index = _options[option].IndexOf(v.OptionValues[option]);
        return index < 0 ? int.MaxValue : index;
    }

    public Result<Variant> AddVariant(string? sku, IReadOnlyList<string>? optionValues, Money price, Money? compareAtPrice = null, Money? cost = null)
    {
        if (cost is { IsNegative: true })
            return Result.Failure<Variant>(Error.Validation(
                "Variant.NegativeCost", "Cost cannot be negative."));

        var trimmedSku = sku?.Trim() ?? string.Empty;
        if (trimmedSku.Length is < 1 or > 64)
            return Result.Failure<Variant>(Error.Validation(
                "Variant.InvalidSku", "SKU must be between 1 and 64 characters."));

        if (_variants.Any(v => string.Equals(v.Sku, trimmedSku, StringComparison.OrdinalIgnoreCase)))
            return Result.Failure<Variant>(Error.Conflict(
                "Variant.DuplicateSku", $"SKU '{trimmedSku}' already exists in this product."));

        if (price.IsNegative)
            return Result.Failure<Variant>(Error.Validation(
                "Variant.NegativePrice", "Price cannot be negative."));

        var values = optionValues ?? [];
        if (values.Count != _options.Count)
            return Result.Failure<Variant>(Error.Validation(
                "Variant.OptionMismatch",
                $"Variant must provide exactly {_options.Count} option value(s), got {values.Count}."));

        for (var i = 0; i < _options.Count; i++)
        {
            if (!_options[i].HasValue(values[i]))
                return Result.Failure<Variant>(Error.Validation(
                    "Variant.UnknownOptionValue",
                    $"'{values[i]}' is not a value of option '{_options[i].Name}'."));
        }

        if (_variants.Any(v => v.Matches(values)))
            return Result.Failure<Variant>(Error.Conflict(
                "Variant.DuplicateCombination", "A variant with this option combination already exists."));

        var variant = new Variant(trimmedSku, values, price, compareAtPrice, cost);
        _variants.Add(variant);
        return variant;
    }

    /// <summary>Asigna el código de barras de una variante (null = borrar; único por producto no se exige).</summary>
    public Result SetVariantBarcode(Guid variantId, string? barcode)
    {
        var variant = _variants.FirstOrDefault(v => v.Id == variantId);
        if (variant is null)
            return Result.Failure(Error.NotFound("Variant.NotFound", "Variant not found."));
        var trimmed = barcode?.Trim();
        if (trimmed is { Length: > 64 })
            return Result.Failure(Error.Validation("Variant.InvalidBarcode", "El código de barras admite hasta 64 caracteres."));
        variant.SetBarcode(string.IsNullOrEmpty(trimmed) ? null : trimmed);
        return Result.Success();
    }

    /// <summary>Setea el costo unitario de una variante (null = borrar el dato).</summary>
    public Result SetVariantCost(Guid variantId, Money? cost)
    {
        var variant = _variants.FirstOrDefault(v => v.Id == variantId);
        if (variant is null)
            return Result.Failure(Error.NotFound("Variant.NotFound", "Variant not found."));
        if (cost is { IsNegative: true })
            return Result.Failure(Error.Validation("Variant.NegativeCost", "Cost cannot be negative."));
        variant.SetCost(cost);
        return Result.Success();
    }

    public Result Publish()
    {
        if (Status == ProductStatus.Archived)
            return Result.Failure(Error.Conflict(
                "Product.Archived", "Archived products cannot be published. Restore it first."));

        if (_variants.Count == 0)
            return Result.Failure(Error.Validation(
                "Product.NoVariants", "A product needs at least one variant to be published."));

        if (Status == ProductStatus.Active)
            return Result.Success(); // idempotente

        Status = ProductStatus.Active;
        RaiseDomainEvent(new ProductPublishedEvent(TenantId.Value, Id, Slug.Value));
        return Result.Success();
    }

    public void Archive() => Status = ProductStatus.Archived;

    public void Restore()
    {
        if (Status != ProductStatus.Archived)
            throw new DomainException("Only archived products can be restored.");
        Status = ProductStatus.Draft;
    }

    /// <summary>
    /// Reemplaza el slug. Solo para resolución de colisiones al crear y
    /// para cambio explícito del merchant — nunca automático en renombres.
    /// </summary>
    public void OverrideSlug(Slug slug) => Slug = slug;

    public const int MaxImages = 10;

    public Result<ProductImage> AddImage(string? url, string? altText)
    {
        var trimmed = url?.Trim() ?? string.Empty;
        if (trimmed.Length is < 10 or > 500 || !Uri.IsWellFormedUriString(trimmed, UriKind.Absolute))
            return Result.Failure<ProductImage>(Error.Validation(
                "Image.InvalidUrl", "Image URL must be a valid absolute URL."));

        if (_images.Count >= MaxImages)
            return Result.Failure<ProductImage>(Error.Validation(
                "Image.TooMany", $"A product supports at most {MaxImages} images."));

        var image = new ProductImage(trimmed, altText?.Trim(), _images.Count);
        _images.Add(image);
        return image;
    }

    /// <summary>Vacía la galería. La usa el import masivo para reemplazar (idempotente).</summary>
    public void ClearImages() => _images.Clear();

    /// <summary>Reordena las imágenes según el orden de ids dado (las no listadas van al final).</summary>
    public void ReorderImages(IReadOnlyList<Guid> orderedIds)
    {
        var rank = new Dictionary<Guid, int>();
        for (var i = 0; i < orderedIds.Count; i++) rank[orderedIds[i]] = i;

        var sorted = _images
            .OrderBy(img => rank.TryGetValue(img.Id, out var r) ? r : int.MaxValue)
            .ToList();

        _images.Clear();
        for (var i = 0; i < sorted.Count; i++)
        {
            sorted[i].MoveTo(i);
            _images.Add(sorted[i]);
        }
    }

    public void SetSeo(string? title, string? description)
    {
        SeoTitle = string.IsNullOrWhiteSpace(title) ? null : title.Trim();
        SeoDescription = string.IsNullOrWhiteSpace(description) ? null : description.Trim();
    }

    public Result RemoveImage(Guid imageId)
    {
        var image = _images.FirstOrDefault(i => i.Id == imageId);
        if (image is null)
            return Result.Failure(Error.NotFound("Image", imageId));

        _images.Remove(image);
        // Compactar posiciones para que el orden quede contiguo.
        for (var i = 0; i < _images.Count; i++)
            _images[i].MoveTo(i);

        return Result.Success();
    }

    public Result ChangeVariantPrice(Guid variantId, Money price, Money? compareAtPrice = null)
    {
        var variant = _variants.FirstOrDefault(v => v.Id == variantId);
        if (variant is null)
            return Result.Failure(Error.NotFound("Variant", variantId));

        if (price.IsNegative)
            return Result.Failure(Error.Validation(
                "Variant.NegativePrice", "Price cannot be negative."));

        variant.ChangePrice(price, compareAtPrice);
        return Result.Success();
    }

    /// <summary>Reemplaza las categorías del producto (ignora vacíos y duplicados).</summary>
    public void SetCategories(IEnumerable<Guid> categoryIds)
    {
        _categoryIds.Clear();
        foreach (var id in categoryIds.Where(id => id != Guid.Empty).Distinct())
            _categoryIds.Add(id);
    }

    /// <summary>Setea la marca (normaliza vacío → null, recorta a 100 chars).</summary>
    public void SetBrand(string? brand) => Brand = Text.Clip(brand, 100);

    public Result UpdateDetails(string? name, string? description)
    {
        var trimmed = name?.Trim() ?? string.Empty;
        if (trimmed.Length is < 1 or > 255)
            return Result.Failure(Error.Validation(
                "Product.InvalidName", "Name must be between 1 and 255 characters."));

        // El slug NO se regenera: cambiarlo rompe SEO y links compartidos.
        Name = trimmed;
        Description = description?.Trim();
        return Result.Success();
    }
}
