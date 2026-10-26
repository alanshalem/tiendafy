using Api.Ai.Catalog;

namespace UnitTests.Api.Ai.Catalog;

public sealed class GtinTests
{
    [Fact]
    public void EAN13_con_digito_verificador_correcto_es_valido()
    {
        Assert.True(Gtin.IsValid("4006381333931"));
    }

    [Fact]
    public void EAN13_con_digito_verificador_incorrecto_no_es_valido()
    {
        Assert.False(Gtin.IsValid("4006381333932"));
    }

    [Fact]
    public void UPC_A_de_12_digitos_es_valido()
    {
        Assert.True(Gtin.IsValid("036000291452"));
    }

    [Theory]
    [InlineData("12345")]
    [InlineData("")]
    [InlineData(null)]
    [InlineData("40063813339AB")]
    public void Largo_incorrecto_o_no_numerico_no_es_valido(string? value)
    {
        Assert.False(Gtin.IsValid(value));
    }

    [Fact]
    public void Normalize_saca_espacios_y_guiones()
    {
        Assert.Equal("4006381333931", Gtin.Normalize("400-6381 333931"));
        Assert.True(Gtin.IsValid(Gtin.Normalize("400-6381 333931")));
    }
}
