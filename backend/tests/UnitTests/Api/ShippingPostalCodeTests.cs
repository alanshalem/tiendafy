using Api.Shipping;

namespace UnitTests.Api;

/// <summary>
/// El CP cotizado contra el de la dirección: sin esta comparación, se cotizaba
/// a un CP barato y la compra salía para otro.
/// </summary>
public sealed class ShippingPostalCodeTests
{
    [Theory]
    [InlineData("1425", "1425")]
    [InlineData("C1425ABC", "1425")]
    [InlineData(" c1425abc ", "1425")]
    [InlineData("142", null)]
    [InlineData("", null)]
    [InlineData(null, null)]
    public void SeComparaLaParteNumericaDeCuatroDigitos(string? raw, string? expected) =>
        Assert.Equal(expected, ShippingPostalCode.Normalize(raw));

    [Theory]
    [InlineData("Corrientes 1234, 3B, CABA, CP C1043AAZ", "1043")]
    [InlineData("Corrientes 1234, CABA, CP 1043", "1043")]
    [InlineData("Corrientes 1234, CABA, cp: 1043", "1043")]
    [InlineData("Ruta 3 km 1234, Chubut", null)]
    [InlineData("Pasaje CPA 12", null)]
    public void LeeElCpDeLaDireccionQueArmaLaTienda(string address, string? expected) =>
        Assert.Equal(expected, ShippingPostalCode.FromAddress(address));

    [Fact]
    public void ElMismoDestinoPasa()
    {
        Assert.Null(ShippingPostalCode.Check("1043", "C1043AAZ", "Corrientes 1234, CP C1043AAZ"));
        Assert.Null(ShippingPostalCode.Check("1043", "1043", "Corrientes 1234"));
        Assert.Null(ShippingPostalCode.Check("1043", null, "Corrientes 1234, CP 1043"));
    }

    [Fact]
    public void OtroCodigoPostalPideVolverACotizar()
    {
        var error = ShippingPostalCode.Check("1043", "9410", "Rivadavia 10, CP 9410");
        Assert.Equal("Checkout.PostalCodeChanged", error?.Code);

        // Aunque el campo diga el cotizado, si la dirección dice otro.
        Assert.Equal("Checkout.PostalCodeChanged",
            ShippingPostalCode.Check("1043", "1043", "Rivadavia 10, CP 9410")?.Code);
    }

    [Fact]
    public void SinCodigoPostalNoSeSabeADondeVa() =>
        Assert.Equal("Checkout.MissingPostalCode", ShippingPostalCode.Check("1043", null, "Rivadavia 10")?.Code);
}
