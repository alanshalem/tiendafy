using Orders.Core.Domain;
using SharedKernel.Common;
using SharedKernel.Domain;

namespace UnitTests.Orders;

public class OrderRefundTests
{
    private static Order PaidOrder(long unitPriceMinor = 10_000, int quantity = 2)
    {
        var order = Order.Create(
            TenantId.From(Guid.NewGuid()),
            Guid.NewGuid(),
            "buyer@test.com",
            "ARS",
            [(Guid.NewGuid(), "Producto", "Rojo / M", "SKU-1", new Money(unitPriceMinor, "ARS"), quantity, null)]).Value;
        order.MarkPaid("mp-payment-1");
        return order;
    }

    [Fact]
    public void ApplyRefund_Partial_AccumulatesAndSetsPartiallyRefunded()
    {
        var order = PaidOrder(); // total 200.00

        var result = order.ApplyRefund(new Money(5_000, "ARS")); // 50.00

        Assert.True(result.IsSuccess);
        Assert.Equal(OrderStatus.PartiallyRefunded, order.Status);
        Assert.Equal(5_000, order.RefundedAmount.AmountInMinorUnits);
    }

    [Fact]
    public void ApplyRefund_AccumulatedToTotal_BecomesRefunded()
    {
        var order = PaidOrder(); // total 200.00

        Assert.True(order.ApplyRefund(new Money(15_000, "ARS")).IsSuccess);
        Assert.Equal(OrderStatus.PartiallyRefunded, order.Status);

        Assert.True(order.ApplyRefund(new Money(5_000, "ARS")).IsSuccess);
        Assert.Equal(OrderStatus.Refunded, order.Status);
        Assert.Equal(20_000, order.RefundedAmount.AmountInMinorUnits);
    }

    [Fact]
    public void ApplyRefund_ExceedingRemaining_Fails()
    {
        var order = PaidOrder(); // total 200.00
        order.ApplyRefund(new Money(15_000, "ARS"));

        var result = order.ApplyRefund(new Money(6_000, "ARS")); // remaining 50.00

        Assert.True(result.IsFailure);
        Assert.Equal(OrderStatus.PartiallyRefunded, order.Status);
        Assert.Equal(15_000, order.RefundedAmount.AmountInMinorUnits);
    }

    [Fact]
    public void ApplyRefund_ZeroOrNegative_Fails()
    {
        var order = PaidOrder();

        Assert.True(order.ApplyRefund(Money.Zero("ARS")).IsFailure);
        Assert.True(order.ApplyRefund(new Money(-100, "ARS")).IsFailure);
    }

    [Fact]
    public void ApplyRefund_OnPendingOrder_Fails()
    {
        var order = Order.Create(
            TenantId.From(Guid.NewGuid()), Guid.NewGuid(), "buyer@test.com", "ARS",
            [(Guid.NewGuid(), "P", "", "S", new Money(1_000, "ARS"), 1, null)]).Value;

        Assert.True(order.ApplyRefund(new Money(500, "ARS")).IsFailure);
    }

    [Fact]
    public void ApplyRefund_OnFulfilledOrder_Succeeds()
    {
        var order = PaidOrder();
        order.MarkFulfilled(null);

        Assert.True(order.ApplyRefund(new Money(1_000, "ARS")).IsSuccess);
        Assert.Equal(OrderStatus.PartiallyRefunded, order.Status);
    }

    [Fact]
    public void ApplyRefund_WrongCurrency_Fails()
    {
        var order = PaidOrder();

        Assert.True(order.ApplyRefund(new Money(1_000, "USD")).IsFailure);
    }

    [Fact]
    public void RemainingRefundable_ReflectsAccumulated()
    {
        var order = PaidOrder(); // total 200.00
        Assert.Equal(20_000, order.RemainingRefundable.AmountInMinorUnits);

        order.ApplyRefund(new Money(7_500, "ARS"));
        Assert.Equal(12_500, order.RemainingRefundable.AmountInMinorUnits);
    }

    [Fact]
    public void MarkRefunded_TotalLegacy_StillWorks_AndFillsRefundedAmount()
    {
        var order = PaidOrder(); // total 200.00

        Assert.True(order.MarkRefunded());
        Assert.Equal(OrderStatus.Refunded, order.Status);
        Assert.Equal(20_000, order.RefundedAmount.AmountInMinorUnits);
        Assert.False(order.MarkRefunded()); // idempotente
    }

    [Fact]
    public void MarkRefunded_AfterPartial_CompletesToTotal()
    {
        var order = PaidOrder(); // total 200.00
        order.ApplyRefund(new Money(5_000, "ARS"));

        Assert.True(order.MarkRefunded()); // webhook "refunded" total
        Assert.Equal(OrderStatus.Refunded, order.Status);
        Assert.Equal(20_000, order.RefundedAmount.AmountInMinorUnits);
    }
}
