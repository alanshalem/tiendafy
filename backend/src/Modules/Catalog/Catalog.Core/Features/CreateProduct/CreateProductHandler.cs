using Catalog.Contracts;
using Catalog.Core.Domain;
using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace Catalog.Core.Features.CreateProduct;

public sealed class CreateProductHandler(IProductRepository repository, IUnitOfWork unitOfWork)
{
    private const int MaxSlugAttempts = 10;

    public async Task<Result<ProductDto>> HandleAsync(CreateProductCommand command, CancellationToken ct = default)
    {
        var productResult = Product.Create(command.TenantId, command.Name, command.Description);
        if (productResult.IsFailure)
            return Result.Failure<ProductDto>(productResult.Error);

        var product = productResult.Value;

        foreach (var option in command.Options)
        {
            var optionResult = product.AddOption(option.Name, option.Values);
            if (optionResult.IsFailure)
                return Result.Failure<ProductDto>(optionResult.Error);
        }

        foreach (var variant in command.Variants)
        {
            var price = new Money(variant.PriceAmount, variant.Currency);
            Money? compareAt = variant.CompareAtAmount.HasValue
                ? new Money(variant.CompareAtAmount.Value, variant.Currency)
                : null;
            Money? cost = variant.CostAmount.HasValue
                ? new Money(variant.CostAmount.Value, variant.Currency)
                : null;

            var variantResult = product.AddVariant(variant.Sku, variant.OptionValues, price, compareAt, cost);
            if (variantResult.IsFailure)
                return Result.Failure<ProductDto>(variantResult.Error);

            var id = variantResult.Value.Id;
            if (!string.IsNullOrWhiteSpace(variant.Barcode))
            {
                var barcode = product.SetVariantBarcode(id, variant.Barcode);
                if (barcode.IsFailure) return Result.Failure<ProductDto>(barcode.Error);
            }
            if (variant.WeightGrams is not null || variant.LengthCm is not null
                || variant.WidthCm is not null || variant.HeightCm is not null)
            {
                var shipping = product.SetVariantShipping(
                    id, variant.WeightGrams, variant.LengthCm, variant.WidthCm, variant.HeightCm);
                if (shipping.IsFailure) return Result.Failure<ProductDto>(shipping.Error);
            }
        }

        if (command.Publish)
        {
            var publishResult = product.Publish();
            if (publishResult.IsFailure)
                return Result.Failure<ProductDto>(publishResult.Error);
        }

        // Slug en uso por otro producto del tenant → sufijo numérico.
        // El índice único (tenant_id, slug) es la garantía real contra la race.
        if (await repository.SlugExistsAsync(product.TenantId, product.Slug.Value, ct))
        {
            var resolved = await ResolveSlugCollisionAsync(product, ct);
            if (resolved.IsFailure)
                return Result.Failure<ProductDto>(resolved.Error);
        }

        await repository.AddAsync(product, ct);
        await unitOfWork.SaveChangesAsync(ct);

        return product.ToDto();
    }

    private async Task<Result> ResolveSlugCollisionAsync(Product product, CancellationToken ct)
    {
        for (var i = 2; i <= MaxSlugAttempts; i++)
        {
            var candidate = Slug.Create($"{product.Slug.Value}-{i}");
            if (candidate.IsFailure)
                return Result.Failure(candidate.Error);

            if (!await repository.SlugExistsAsync(product.TenantId, candidate.Value.Value, ct))
            {
                product.OverrideSlug(candidate.Value);
                return Result.Success();
            }
        }

        return Result.Failure(Error.Conflict(
            "Product.SlugExhausted",
            $"No hay un identificador de URL libre para «{product.Slug.Value}». Probá con otro nombre."));
    }
}
