using Orders.Core.Domain;
using SharedKernel.Common;

namespace Orders.Core.Features;

public sealed record CreateOrderLine(
    Guid VariantId, string ProductName, string VariantDescription, string Sku,
    Money UnitPrice, int Quantity, Guid? ReservationId);

public sealed record CreateOrderCommand(
    TenantId TenantId, Guid CheckoutSessionId, string BuyerEmail, string Currency,
    IReadOnlyList<CreateOrderLine> Lines, Money? Discount = null, string? CouponCode = null);

public sealed class CreateOrderHandler(IOrderRepository repository)
{
    public async Task<Result<Order>> HandleAsync(CreateOrderCommand command, CancellationToken ct = default)
    {
        var result = Order.Create(
            command.TenantId, command.CheckoutSessionId, command.BuyerEmail, command.Currency,
            command.Lines.Select(l => (l.VariantId, l.ProductName, l.VariantDescription, l.Sku, l.UnitPrice, l.Quantity, l.ReservationId)).ToList(),
            command.Discount, command.CouponCode);

        if (result.IsFailure) return result;

        await repository.AddAsync(result.Value, ct);
        await repository.SaveChangesAsync(ct);
        return result;
    }
}
