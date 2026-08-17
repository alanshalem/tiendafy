using Orders.Core.Domain;
using SharedKernel.Common;

namespace UnitTests.Orders;

public class OrderProfitTests
{
    private static Order Create(params (long PriceMinor, int Qty, long? CostMinor)[] items) =>
        Order.Create(
            TestData.Tenant, Guid.NewGuid(), "buyer@test.com", "ARS",
            items.Select(i => (Guid.NewGuid(), "Producto", "", $"SKU-{i.PriceMinor}",
                new Money(i.PriceMinor, "ARS"), i.Qty, (Guid?)null,
                i.CostMinor is { } c ? new Money(c, "ARS") : (Money?)null)).ToList()).Value;

    [Fact]
    public void ProductCost_sums_only_items_with_cost()
    {
        var order = Create((10_000, 2, 4_000), (5_000, 1, null));
        Assert.Equal(8_000, order.ProductCost!.Value.AmountInMinorUnits);
    }

    [Fact]
    public void ProductCost_is_null_when_no_item_has_cost()
    {
        var order = Create((10_000, 1, null));
        Assert.Null(order.ProductCost);
    }

    [Fact]
    public void RecordMpFee_persists_fee()
    {
        var order = Create((10_000, 1, 4_000));
        order.RecordMpFee(new Money(410, "ARS"));
        Assert.Equal(410, order.MpFeeAmount!.Value.AmountInMinorUnits);
    }
}
