using Orders.Core.Domain;
using SharedKernel.Common;

namespace UnitTests.Orders;

public class OrderShippingTests
{
    private static Order NewOrder(long unitPriceMinor = 10_000, long discountMinor = 0)
    {
        return Order.Create(
            TenantId.From(Guid.NewGuid()),
            Guid.NewGuid(),
            "buyer@test.com",
            "ARS",
            [(Guid.NewGuid(), "Producto", "", "SKU-1", new Money(unitPriceMinor, "ARS"), 2, null)],
            discountMinor > 0 ? new Money(discountMinor, "ARS") : null).Value;
    }

    [Fact]
    public void Total_IncludesShippingCost()
    {
        var order = NewOrder(); // subtotal 200.00
        order.SetShippingAndBuyer(new Money(5_000, "ARS"), "Andreani", "San Martín 123", "Ana", "111", "12345678", null);

        Assert.Equal(25_000, order.Total.AmountInMinorUnits);
        Assert.Equal("Andreani", order.ShippingMethodName);
    }

    [Fact]
    public void Total_DiscountAppliesBeforeShipping()
    {
        var order = NewOrder(discountMinor: 25_000); // descuento > subtotal → base 0
        order.SetShippingAndBuyer(new Money(5_000, "ARS"), "Retiro", null, null, null, null, null);

        Assert.Equal(5_000, order.Total.AmountInMinorUnits); // solo el envío
    }

    [Fact]
    public void SetShipping_WrongCurrencyOrNegative_Ignored()
    {
        var order = NewOrder();
        order.SetShippingAndBuyer(new Money(5_000, "USD"), null, null, null, null, null, null);
        Assert.Equal(0, order.ShippingCost.AmountInMinorUnits);

        order.SetShippingAndBuyer(new Money(-100, "ARS"), null, null, null, null, null, null);
        Assert.Equal(0, order.ShippingCost.AmountInMinorUnits);
    }

    [Fact]
    public void Refund_RemainingIncludesShipping()
    {
        var order = NewOrder(); // subtotal 200 + envío 50 = 250
        order.SetShippingAndBuyer(new Money(5_000, "ARS"), "Envío", "Calle 1", null, null, null, null);
        order.MarkPaid("mp-1");

        Assert.Equal(25_000, order.RemainingRefundable.AmountInMinorUnits);
        Assert.True(order.ApplyRefund(new Money(25_000, "ARS")).IsSuccess);
        Assert.Equal(OrderStatus.Refunded, order.Status);
    }
}
