using Orders.Core.Domain;
using SharedKernel.Common;

namespace Orders.Core.Features;

public sealed record CreateOrderLine(
    Guid VariantId, string ProductName, string VariantDescription, string Sku,
    Money UnitPrice, int Quantity, Guid? ReservationId, Money? UnitCost = null);

public sealed record CreateOrderCommand(
    TenantId TenantId, Guid CheckoutSessionId, string BuyerEmail, string Currency,
    IReadOnlyList<CreateOrderLine> Lines, Money? Discount = null, string? CouponCode = null,
    Money? ShippingCost = null, string? ShippingMethodName = null, string? ShippingAddress = null,
    string? BuyerName = null, string? BuyerPhone = null, string? DocNumber = null, string? Notes = null,
    string? UtmSource = null, bool IsPickup = false, OfflinePaymentPlan? OfflinePayment = null);

/// <summary>
/// La orden se paga por transferencia o en efectivo (ver Order.UseOfflinePayment):
/// el descuento entra antes de guardarla, así nunca existe una versión de la
/// orden con el total sin descontar.
/// </summary>
public sealed record OfflinePaymentPlan(string Provider, int DiscountPercent, DateTime DueAtUtc);

public sealed class CreateOrderHandler(IOrderRepository repository)
{
    public async Task<Result<Order>> HandleAsync(CreateOrderCommand command, CancellationToken ct = default)
    {
        var result = Order.Create(
            command.TenantId, command.CheckoutSessionId, command.BuyerEmail, command.Currency,
            command.Lines.Select(l => (l.VariantId, l.ProductName, l.VariantDescription, l.Sku, l.UnitPrice, l.Quantity, l.ReservationId, l.UnitCost)).ToList(),
            command.Discount, command.CouponCode);

        if (result.IsFailure) return result;

        result.Value.SetUtmSource(command.UtmSource);
        result.Value.SetShippingAndBuyer(
            command.ShippingCost ?? Money.Zero(command.Currency),
            command.ShippingMethodName, command.ShippingAddress,
            command.BuyerName, command.BuyerPhone, command.DocNumber, command.Notes, command.IsPickup);

        if (command.OfflinePayment is { } plan)
        {
            var offline = result.Value.UseOfflinePayment(plan.Provider, plan.DiscountPercent, plan.DueAtUtc);
            if (offline.IsFailure) return Result.Failure<Order>(offline.Error);
        }

        await repository.AddAsync(result.Value, ct);
        await repository.SaveChangesAsync(ct);
        return result;
    }
}
