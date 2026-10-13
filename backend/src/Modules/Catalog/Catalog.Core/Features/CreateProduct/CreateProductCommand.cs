using SharedKernel.Common;

namespace Catalog.Core.Features.CreateProduct;

public sealed record CreateProductCommand(
    TenantId TenantId,
    string Name,
    string? Description,
    IReadOnlyList<CreateProductOption> Options,
    IReadOnlyList<CreateProductVariant> Variants,
    bool Publish);

public sealed record CreateProductOption(string Name, IReadOnlyList<string> Values);

public sealed record CreateProductVariant(
    string Sku,
    IReadOnlyList<string> OptionValues,
    long PriceAmount,
    string Currency,
    long? CompareAtAmount,
    long? CostAmount = null,
    string? Barcode = null,
    int? WeightGrams = null,
    int? LengthCm = null,
    int? WidthCm = null,
    int? HeightCm = null);
