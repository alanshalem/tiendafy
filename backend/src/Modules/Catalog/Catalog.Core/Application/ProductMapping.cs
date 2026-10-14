using Catalog.Contracts;
using Catalog.Core.Domain;
using SharedKernel.Common;

namespace Catalog.Core;

public static class ProductMapping
{
    public static ProductDto ToDto(this Product product) => new(
        product.Id,
        product.Name,
        product.Slug.Value,
        product.Description,
        product.SeoTitle,
        product.SeoDescription,
        product.Brand,
        product.Status.ToApiString(),
        product.Options.Select(o => new ProductOptionDto(o.Name, o.Values)).ToList(),
        product.Variants.Select(v => v.ToDto()).ToList(),
        product.Images.OrderBy(i => i.Position)
            .Select(i => new ProductImageDto(i.Id, i.Url, i.AltText, i.Position)).ToList(),
        product.CategoryIds,
        product.Specs.Select(x => new ProductSpecDto(x.DefinitionId, x.Value)).ToList(),
        product.CreatedAtUtc,
        UpdatedAtUtc: product.UpdatedAtUtc ?? product.CreatedAtUtc);

    public static VariantDto ToDto(this Variant variant) => new(
        variant.Id,
        variant.Sku,
        variant.OptionValues,
        variant.Price.ToDto(),
        variant.CompareAtPrice?.ToDto(),
        variant.Barcode,
        variant.WeightGrams,
        variant.LengthCm,
        variant.WidthCm,
        variant.HeightCm);

    public static MoneyDto ToDto(this Money money) => new(money.AmountInMinorUnits, money.Currency);
}
