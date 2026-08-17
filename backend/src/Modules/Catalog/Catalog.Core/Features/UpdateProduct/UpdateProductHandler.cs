using Catalog.Contracts;
using Catalog.Core.Domain;
using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace Catalog.Core.Features.UpdateProduct;

public sealed record UpdateProductDetailsCommand(
    TenantId TenantId, Guid ProductId, string Name, string? Description,
    string? SeoTitle = null, string? SeoDescription = null, string? Brand = null);

public sealed record ReorderImagesCommand(TenantId TenantId, Guid ProductId, IReadOnlyList<Guid> ImageIds);

public sealed record SetProductStatusCommand(
    TenantId TenantId, Guid ProductId, bool Publish);

public sealed record ChangeVariantPriceCommand(
    TenantId TenantId, Guid ProductId, Guid VariantId,
    long PriceAmount, string Currency, long? CompareAtAmount);

public sealed record AddImageCommand(TenantId TenantId, Guid ProductId, string Url, string? AltText);

/// <summary>Costos por variante (null = borrar). Solo admin: nunca sale por DTOs públicos.</summary>
public sealed record SetVariantCostsCommand(
    TenantId TenantId, Guid ProductId, IReadOnlyList<(Guid VariantId, long? CostAmount)> Costs, string Currency);

public sealed record RemoveImageCommand(TenantId TenantId, Guid ProductId, Guid ImageId);

public sealed class UpdateProductHandler(IProductRepository repository, IUnitOfWork unitOfWork)
{
    private const string ProductEntity = "Product";

    /// <summary>Carga el producto del tenant o devuelve el NotFound estándar.</summary>
    private async Task<Result<Product>> LoadAsync(TenantId tenantId, Guid productId, CancellationToken ct)
    {
        var product = await repository.GetByIdAsync(tenantId, productId, ct);
        return product is null
            ? Result.Failure<Product>(Error.NotFound(ProductEntity, productId))
            : product;
    }

    public async Task<Result<ProductDto>> UpdateDetailsAsync(UpdateProductDetailsCommand command, CancellationToken ct = default)
    {
        var loaded = await LoadAsync(command.TenantId, command.ProductId, ct);
        if (loaded.IsFailure) return Result.Failure<ProductDto>(loaded.Error);
        var product = loaded.Value;

        var result = product.UpdateDetails(command.Name, command.Description);
        if (result.IsFailure)
            return Result.Failure<ProductDto>(result.Error);

        product.SetSeo(command.SeoTitle, command.SeoDescription);
        product.SetBrand(command.Brand);

        await unitOfWork.SaveChangesAsync(ct);
        return product.ToDto();
    }

    public async Task<Result<ProductDto>> ReorderImagesAsync(ReorderImagesCommand command, CancellationToken ct = default)
    {
        var loaded = await LoadAsync(command.TenantId, command.ProductId, ct);
        if (loaded.IsFailure) return Result.Failure<ProductDto>(loaded.Error);
        var product = loaded.Value;

        product.ReorderImages(command.ImageIds);
        await unitOfWork.SaveChangesAsync(ct);
        return product.ToDto();
    }

    public async Task<Result<ProductDto>> DuplicateAsync(TenantId tenantId, Guid productId, CancellationToken ct = default)
    {
        var loaded = await LoadAsync(tenantId, productId, ct);
        if (loaded.IsFailure) return Result.Failure<ProductDto>(loaded.Error);
        var src = loaded.Value;

        var created = Product.Create(tenantId, $"Copia de {src.Name}", src.Description);
        if (created.IsFailure) return Result.Failure<ProductDto>(created.Error);
        var copy = created.Value;

        // Slug libre.
        if (await repository.SlugExistsAsync(tenantId, copy.Slug.Value, ct))
        {
            for (var i = 2; i <= 50; i++)
            {
                var candidate = Slug.Create($"{copy.Slug.Value}-{i}");
                if (candidate.IsSuccess && !await repository.SlugExistsAsync(tenantId, candidate.Value.Value, ct))
                {
                    copy.OverrideSlug(candidate.Value);
                    break;
                }
            }
        }

        foreach (var opt in src.Options)
            copy.AddOption(opt.Name, opt.Values);
        foreach (var v in src.Variants)
            copy.AddVariant(v.Sku, v.OptionValues, v.Price, v.CompareAtPrice, v.Cost);
        foreach (var img in src.Images.OrderBy(i => i.Position))
            copy.AddImage(img.Url, img.AltText);
        copy.SetCategories(src.CategoryIds);
        copy.SetSeo(src.SeoTitle, src.SeoDescription);
        copy.SetBrand(src.Brand);
        // Queda en Draft a propósito (no publicar la copia automáticamente).

        await repository.AddAsync(copy, ct);
        await unitOfWork.SaveChangesAsync(ct);
        return copy.ToDto();
    }

    public async Task<Result> SetVariantCostsAsync(SetVariantCostsCommand command, CancellationToken ct = default)
    {
        var loaded = await LoadAsync(command.TenantId, command.ProductId, ct);
        if (loaded.IsFailure) return Result.Failure(loaded.Error);
        var product = loaded.Value;

        foreach (var (variantId, costAmount) in command.Costs)
        {
            var result = product.SetVariantCost(
                variantId, costAmount is { } amount ? new Money(amount, command.Currency) : null);
            if (result.IsFailure) return result;
        }

        await unitOfWork.SaveChangesAsync(ct);
        return Result.Success();
    }

    public async Task<Result<ProductDto>> SetStatusAsync(SetProductStatusCommand command, CancellationToken ct = default)
    {
        var loaded = await LoadAsync(command.TenantId, command.ProductId, ct);
        if (loaded.IsFailure) return Result.Failure<ProductDto>(loaded.Error);
        var product = loaded.Value;

        if (command.Publish)
        {
            // "Publicar" un archivado = restaurar + publicar (intent del merchant).
            if (product.Status == ProductStatus.Archived)
                product.Restore();

            var result = product.Publish();
            if (result.IsFailure)
                return Result.Failure<ProductDto>(result.Error);
        }
        else
        {
            product.Archive();
        }

        await unitOfWork.SaveChangesAsync(ct);
        return product.ToDto();
    }

    public async Task<Result<ProductDto>> AddImageAsync(AddImageCommand command, CancellationToken ct = default)
    {
        var loaded = await LoadAsync(command.TenantId, command.ProductId, ct);
        if (loaded.IsFailure) return Result.Failure<ProductDto>(loaded.Error);
        var product = loaded.Value;

        var result = product.AddImage(command.Url, command.AltText);
        if (result.IsFailure)
            return Result.Failure<ProductDto>(result.Error);

        await unitOfWork.SaveChangesAsync(ct);
        return product.ToDto();
    }

    public async Task<Result<ProductDto>> RemoveImageAsync(RemoveImageCommand command, CancellationToken ct = default)
    {
        var loaded = await LoadAsync(command.TenantId, command.ProductId, ct);
        if (loaded.IsFailure) return Result.Failure<ProductDto>(loaded.Error);
        var product = loaded.Value;

        var result = product.RemoveImage(command.ImageId);
        if (result.IsFailure)
            return Result.Failure<ProductDto>(result.Error);

        await unitOfWork.SaveChangesAsync(ct);
        return product.ToDto();
    }

    public async Task<Result<ProductDto>> ChangeVariantPriceAsync(ChangeVariantPriceCommand command, CancellationToken ct = default)
    {
        var loaded = await LoadAsync(command.TenantId, command.ProductId, ct);
        if (loaded.IsFailure) return Result.Failure<ProductDto>(loaded.Error);
        var product = loaded.Value;

        var price = new Money(command.PriceAmount, command.Currency);
        Money? compareAt = command.CompareAtAmount.HasValue
            ? new Money(command.CompareAtAmount.Value, command.Currency)
            : null;

        var result = product.ChangeVariantPrice(command.VariantId, price, compareAt);
        if (result.IsFailure)
            return Result.Failure<ProductDto>(result.Error);

        await unitOfWork.SaveChangesAsync(ct);
        return product.ToDto();
    }
}
