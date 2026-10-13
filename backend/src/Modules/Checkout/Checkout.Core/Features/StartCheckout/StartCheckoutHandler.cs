using Catalog.Contracts;
using Checkout.Core.Domain;
using SharedKernel.Common;

namespace Checkout.Core.Features.StartCheckout;

public sealed record StartCheckoutCommand(
    TenantId TenantId,
    IReadOnlyList<StartCheckoutLine> Lines);

public sealed record StartCheckoutLine(Guid VariantId, int Quantity);

public sealed class StartCheckoutHandler(ICatalogCheckoutQuery catalog, ICheckoutRepository repository)
{
    public async Task<Result<CheckoutSession>> HandleAsync(StartCheckoutCommand command, CancellationToken ct = default)
    {
        if (command.Lines.Count == 0)
            return Result.Failure<CheckoutSession>(Error.Validation("Checkout.Empty", "El carrito está vacío."));

        var variantIds = command.Lines.Select(l => l.VariantId).Distinct().ToList();
        var variants = await catalog.GetVariantsAsync(command.TenantId.Value, variantIds, ct);
        var byId = variants.ToDictionary(v => v.VariantId);

        var lines = new List<(Guid, string, string, string, Money, int)>();
        foreach (var line in command.Lines)
        {
            if (!byId.TryGetValue(line.VariantId, out var variant))
                return Result.Failure<CheckoutSession>(Error.NotFound("Variant", line.VariantId));

            if (!variant.ProductIsActive)
                return Result.Failure<CheckoutSession>(Error.Conflict(
                    "Checkout.ProductUnavailable", $"'{variant.ProductName}' is no longer available."));

            lines.Add((
                variant.VariantId,
                variant.ProductName,
                variant.VariantDescription,
                variant.Sku,
                new Money(variant.Price.Amount, variant.Price.Currency),
                line.Quantity));
        }

        var sessionResult = CheckoutSession.Create(command.TenantId, lines);
        if (sessionResult.IsFailure)
            return sessionResult;

        await repository.AddAsync(sessionResult.Value, ct);
        await repository.SaveChangesAsync(ct);
        return sessionResult;
    }
}
