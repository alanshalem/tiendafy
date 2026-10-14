namespace Catalog.Contracts;

/// <summary>Dinero serializado: centavos + ISO 4217 (espeja Money del SharedKernel).</summary>
public sealed record MoneyDto(long Amount, string Currency);

public sealed record ProductOptionDto(string Name, IReadOnlyList<string> Values);

public sealed record VariantDto(
    Guid Id,
    string Sku,
    IReadOnlyList<string> OptionValues,
    MoneyDto Price,
    MoneyDto? CompareAtPrice,
    string? Barcode = null,
    // Paquete de una unidad para cotizar el envío (null = sin cargar).
    int? WeightGrams = null,
    int? LengthCm = null,
    int? WidthCm = null,
    int? HeightCm = null,
    // Unidades disponibles de ESTA variante. Solo la llena la ficha del
    // storefront (el stock vive en otro módulo); null = desconocido.
    int? Available = null);

public sealed record ProductImageDto(Guid Id, string Url, string? AltText, int Position);

/// <summary>Un valor de ficha técnica del producto. `DefinitionId` lo liga con su definición.</summary>
public sealed record ProductSpecDto(Guid DefinitionId, string Value);

public sealed record ProductDto(
    Guid Id,
    string Name,
    string Slug,
    string? Description,
    string? SeoTitle,
    string? SeoDescription,
    string? Brand,
    string Status,
    IReadOnlyList<ProductOptionDto> Options,
    IReadOnlyList<VariantDto> Variants,
    IReadOnlyList<ProductImageDto> Images,
    IReadOnlyList<Guid> CategoryIds,
    IReadOnlyList<ProductSpecDto> Specs,
    DateTime CreatedAtUtc,
    // Stock total (suma de variantes). Solo lo llena la búsqueda del storefront; null = desconocido.
    int? Stock = null,
    // Estrellas de las reseñas aprobadas. Las llenan las lecturas del storefront
    // (las reseñas viven en otro módulo); null = sin reseñas o la tienda no las muestra.
    ProductRatingDto? Rating = null);

/// <summary>Promedio (1 decimal) y cantidad de reseñas aprobadas de un producto.</summary>
public sealed record ProductRatingDto(decimal Average, int Count);
