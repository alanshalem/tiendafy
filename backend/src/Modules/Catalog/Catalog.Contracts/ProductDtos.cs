namespace Catalog.Contracts;

/// <summary>Dinero serializado: centavos + ISO 4217 (espeja Money del SharedKernel).</summary>
public sealed record MoneyDto(long Amount, string Currency);

public sealed record ProductOptionDto(string Name, IReadOnlyList<string> Values);

public sealed record VariantDto(
    Guid Id,
    string Sku,
    IReadOnlyList<string> OptionValues,
    MoneyDto Price,
    MoneyDto? CompareAtPrice);

public sealed record ProductImageDto(Guid Id, string Url, string? AltText, int Position);

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
    DateTime CreatedAtUtc,
    // Stock total (suma de variantes). Solo lo llena la búsqueda del storefront; null = desconocido.
    int? Stock = null);
