using Api.Orders;
using Api.Shipping;
using Fiscal.Core.Domain;
using Orders.Core.Domain;
using SharedKernel.Common;

namespace UnitTests.Orders;

/// <summary>
/// Lo que el comprador ve de su pedido: el número como lo escribe una
/// persona, el link del correo que lo lleva, los pasos del pedido y el precio
/// sin impuestos nacionales.
/// </summary>
public class OrderTrackingTests
{
    [Theory]
    [InlineData("1042", 1042)]
    [InlineData("#1042", 1042)]
    [InlineData(" Pedido #1042 ", 1042)]
    [InlineData("A1B2C3D4", null)]
    [InlineData("-5", null)]
    [InlineData("0", null)]
    [InlineData("", null)]
    [InlineData(null, null)]
    public void El_numero_se_lee_como_lo_escribe_una_persona(string? text, int? expected) =>
        Assert.Equal(expected, OrderLabel.ParseNumber(text));

    [Fact]
    public void Sin_numero_todavia_el_nombre_cae_al_id_corto()
    {
        var id = Guid.Parse("3f2a9c1e-0000-0000-0000-000000000000");
        Assert.Equal("#3F2A9C1E", OrderLabel.For(0, id));
        Assert.Equal("#1042", OrderLabel.For(1042, id));
    }

    [Fact]
    public void El_link_de_seguimiento_sale_del_envio_creado_o_del_medio()
    {
        var zip = CarrierTrackingLink.For("X", "Envío", zipnova: ("OCA", "123", "https://zipnova.com.ar/t/abc"));
        Assert.Equal(new CarrierTracking("OCA", "123", "https://zipnova.com.ar/t/abc"), zip);

        var andreani = CarrierTrackingLink.For(null, "Andreani", andreaniNumber: "360000123");
        Assert.Equal("https://www.andreani.com/envio/360000123", andreani!.Url);

        // Cargado a mano: el medio dice el correo; el formato UPU, también.
        Assert.Equal("Andreani", CarrierTrackingLink.For("ABC1", "Andreani estándar")!.Carrier);
        var correo = CarrierTrackingLink.For("cp123456789ar", "Envío a domicilio")!;
        Assert.Equal("Correo Argentino", correo.Carrier);
        Assert.StartsWith("https://www.correoargentino.com.ar/", correo.Url);
        Assert.Equal("Correo Argentino", CarrierTrackingLink.For("000123", "Correo Argentino a sucursal")!.Carrier);

        // Un link pegado se usa tal cual; uno peligroso, no.
        Assert.Equal("https://seguimiento.ejemplo.com/x", CarrierTrackingLink.For("https://seguimiento.ejemplo.com/x", null)!.Url);
        Assert.Null(CarrierTrackingLink.For("javascript:alert(1)", null)!.Url);

        // Correo desconocido: número sin link inventado. Sin nada, nada.
        Assert.Equal(new CarrierTracking(null, "XYZ-9", null), CarrierTrackingLink.For("XYZ-9", "Moto"));
        Assert.Null(CarrierTrackingLink.For(" ", "Moto"));
    }

    private static Order NewOrder()
    {
        var order = Order.Create(TenantId.From(Guid.NewGuid()), Guid.NewGuid(), "ana@test.local", "ARS",
            [(Guid.NewGuid(), "Termo", "", "T-1", new Money(10_000, "ARS"), 1, (Guid?)null, (Money?)null)]).Value;
        return order;
    }

    [Fact]
    public void Los_pasos_del_pedido_marcan_lo_que_ya_paso()
    {
        var order = NewOrder();
        var pending = OrderTrackingView.Timeline(order, delivered: false);
        Assert.Equal(["received", "paid", "fulfilled", "delivered"], pending.Select(s => s.Key));
        Assert.Equal([true, false, false, false], pending.Select(s => s.Done));

        order.MarkPaid("p1");
        order.MarkFulfilled("CP123456789AR");
        var shipped = OrderTrackingView.Timeline(order, delivered: true);
        Assert.All(shipped, s => Assert.True(s.Done));

        order.MarkRefunded();
        Assert.Equal("Reembolsado", OrderTrackingView.Timeline(order, false)[^1].Label);

        var failed = NewOrder();
        failed.MarkFailed("p2");
        Assert.Equal(["received", "cancelled"], OrderTrackingView.Timeline(failed, false).Select(s => s.Key));
    }

    [Fact]
    public void Un_retiro_no_tiene_paso_de_entrega()
    {
        var order = NewOrder();
        order.SetShippingAndBuyer(Money.Zero("ARS"), "Retiro", null, null, null, null, null, isPickup: true);
        var steps = OrderTrackingView.Timeline(order, false);
        Assert.Equal(["received", "paid", "fulfilled"], steps.Select(s => s.Key));
        Assert.Equal("Listo para retirar", steps[^1].Label);
    }

    [Theory]
    [InlineData("ana@gmail.com", "a**@gmail.com")]
    [InlineData("a@x.com", "a**@x.com")]
    [InlineData("larguisimo@x.com", "l******@x.com")]
    [InlineData("sinarroba", "***")]
    public void El_email_se_muestra_tapado(string email, string expected) =>
        Assert.Equal(expected, OrderTrackingView.MaskEmail(email));

    [Fact]
    public void Precio_sin_impuestos_nacionales_segun_la_condicion()
    {
        var info = StoreLegalInfo.CreateDefault(Guid.NewGuid());
        // RI al 21 %: $12.100 → $10.000.
        Assert.Equal(10_000_00, info.PriceWithoutTaxes(12_100_00));

        // Con otros impuestos nacionales se suman al divisor.
        info.Update(null, null, null, PriceTaxCondition.ResponsableInscripto, 10.5m, 0m, true, null, null);
        Assert.Equal(1.105m, info.TaxDivisor);
        Assert.Equal(9_049_77, info.PriceWithoutTaxes(10_000_00));

        // Monotributo y exento no discriminan IVA: el precio ya es el neto.
        info.Update(null, null, null, PriceTaxCondition.Monotributo, 21m, 0m, true, null, null);
        Assert.Equal(10_000_00, info.PriceWithoutTaxes(10_000_00));
        info.Update(null, null, null, PriceTaxCondition.Exento, 21m, 0m, true, null, null);
        Assert.Equal(1m, info.TaxDivisor);
    }
}
