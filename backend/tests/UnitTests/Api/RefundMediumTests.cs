using Api.Orders;
using Orders.Core.Domain;
using SharedKernel.Common;

namespace UnitTests.Api;

/// <summary>
/// Por dónde le decimos al comprador que vuelve la plata de un reembolso
/// parcial ({{refund_method}}): una venta manual la devuelve la tienda, y en
/// cuenta corriente no vuelve plata, se acredita.
/// </summary>
public class RefundMediumTests
{
    private static Order ManualSale(string method)
    {
        var order = Order.Create(
            TenantId.From(Guid.NewGuid()), Guid.NewGuid(), "buyer@test.com", "ARS",
            [(Guid.NewGuid(), "Producto", "Única", "SKU-1", new Money(10_000, "ARS"), 1, null, null)]).Value;
        order.MarkPaid(OrderPayment.ManualPaymentId(method));
        return order;
    }

    [Theory]
    [InlineData(OrderPayment.Cash, RefundMedium.Cash)]
    [InlineData(OrderPayment.Transfer, RefundMedium.Transfer)]
    [InlineData(OrderPayment.CurrentAccount, RefundMedium.CurrentAccount)]
    [InlineData("otra", RefundMedium.Manual)]
    public void Una_venta_manual_se_devuelve_por_su_forma_de_cobro(string method, RefundMedium expected) =>
        Assert.Equal(expected, RefundMediums.ForManual(ManualSale(method)));

    [Fact]
    public void Cada_medio_tiene_su_frase_para_el_comprador()
    {
        Assert.Contains("Mercado Pago", RefundMediums.BuyerText(RefundMedium.MercadoPago), StringComparison.Ordinal);
        Assert.Contains("tarjeta", RefundMediums.BuyerText(RefundMedium.Payway), StringComparison.Ordinal);
        Assert.Contains("efectivo", RefundMediums.BuyerText(RefundMedium.Cash), StringComparison.Ordinal);
        Assert.Contains("transferencia", RefundMediums.BuyerText(RefundMedium.Transfer), StringComparison.Ordinal);
        Assert.Contains("cuenta corriente", RefundMediums.BuyerText(RefundMedium.CurrentAccount), StringComparison.Ordinal);

        // Ninguna se repite: si dos medios dijeran lo mismo, el aviso mentiría en uno.
        var texts = Enum.GetValues<RefundMedium>().Select(RefundMediums.BuyerText).ToList();
        Assert.Equal(texts.Count, texts.Distinct().Count());
    }
}
