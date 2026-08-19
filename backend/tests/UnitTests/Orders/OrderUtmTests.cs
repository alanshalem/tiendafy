using Orders.Core.Domain;
using SharedKernel.Common;

namespace UnitTests.Orders;

/// <summary>
/// La atribución de una venta a su canal (redes, email, ML) se agrupa por este
/// campo en Rentabilidad: si el mismo canal entra con distinta capitalización
/// o con espacios, el reporte lo cuenta dos veces. Por eso se normaliza, y por
/// eso está testeado.
/// </summary>
public class OrderUtmTests
{
    private static Order Create() =>
        Order.Create(
            TestData.Tenant, Guid.NewGuid(), "buyer@test.com", "ARS",
            [(Guid.NewGuid(), "Producto", "", "SKU-1", new Money(10_000, "ARS"), 1, (Guid?)null, (Money?)null)]).Value;

    [Theory]
    [InlineData("Instagram", "instagram")]
    [InlineData("  MELI  ", "meli")]
    [InlineData("Email-Campaña", "email-campaña")]
    public void SetUtmSource_normaliza_el_canal(string input, string expected)
    {
        var order = Create();
        order.SetUtmSource(input);
        Assert.Equal(expected, order.UtmSource);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void SetUtmSource_sin_valor_deja_la_venta_sin_canal(string? input)
    {
        var order = Create();
        order.SetUtmSource(input);
        Assert.Null(order.UtmSource);
    }

    [Fact]
    public void SetUtmSource_recorta_a_40_caracteres()
    {
        var order = Create();
        order.SetUtmSource(new string('a', 60));
        Assert.Equal(40, order.UtmSource!.Length);
    }
}
