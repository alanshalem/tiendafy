using Catalog.Contracts;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Common;

namespace Catalog.Infrastructure.Persistence;

public sealed class CatalogCheckoutQuery(CatalogDbContext context) : ICatalogCheckoutQuery
{
    public async Task<IReadOnlyList<CheckoutVariantDto>> GetVariantsAsync(
        Guid tenantId, IReadOnlyCollection<Guid> variantIds, CancellationToken ct = default)
    {
        var tenant = TenantId.From(tenantId);

        var products = await context.Products.AsNoTracking()
            .Where(p => p.TenantId == tenant && p.Variants.Any(v => variantIds.Contains(v.Id)))
            .ToListAsync(ct);

        return products
            .SelectMany(p => p.Variants
                .Where(v => variantIds.Contains(v.Id))
                .Select(v => new CheckoutVariantDto(
                    v.Id,
                    p.Id,
                    p.Name,
                    v.OptionValues.Count > 0 ? string.Join(" / ", v.OptionValues) : "Única",
                    v.Sku,
                    new MoneyDto(v.Price.AmountInMinorUnits, v.Price.Currency),
                    p.Status == Core.Domain.ProductStatus.Active,
                    v.Cost is { } c ? new MoneyDto(c.AmountInMinorUnits, c.Currency) : null)))
            .ToList();
    }
}
