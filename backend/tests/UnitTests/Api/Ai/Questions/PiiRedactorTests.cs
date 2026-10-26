using Api.Ai.Questions;

namespace UnitTests.Api.Ai.Questions;

public sealed class PiiRedactorTests
{
    [Fact]
    public void Tapa_mails()
    {
        Assert.Equal("escribime a [dato oculto]", PiiRedactor.Redact("escribime a juan.perez@gmail.com"));
    }

    [Theory]
    [InlineData("+54 9 11 5555-1234")]
    [InlineData("1155551234")]
    [InlineData("011 4555-1234")]
    public void Tapa_telefonos(string phone)
    {
        var result = PiiRedactor.Redact($"llamame al {phone} gracias");

        Assert.Contains(PiiRedactor.Mask, result);
        Assert.DoesNotContain(result, c => char.IsDigit(c));
    }

    [Theory]
    [InlineData("DNI 30.123.456")]
    [InlineData("DNI 30123456")]
    [InlineData("20-30123456-7")]
    [InlineData("20301234567")]
    [InlineData("CUIT 20-30.123.456-7")]
    [InlineData("CUIT 20 30123456 7")]
    public void Tapa_dni_y_cuit(string text)
    {
        var result = PiiRedactor.Redact(text);

        Assert.Contains(PiiRedactor.Mask, result);
        Assert.DoesNotContain(result, c => char.IsDigit(c));
    }

    [Theory]
    [InlineData("¿$ 1.250.000 por 2 unidades, talle 42?")]
    [InlineData("Te lo dejo en 1250000 pesos")]
    [InlineData("Sale 1.250.000 pesos con envío")]
    [InlineData("$30123456")]
    public void No_tapa_precios_ni_cantidades(string text)
    {
        Assert.Equal(text, PiiRedactor.Redact(text));
    }

    [Fact]
    public void Un_cuit_pegado_a_un_signo_no_queda_a_medias()
    {
        var result = PiiRedactor.Redact("mi cuit:20301234567.");

        Assert.DoesNotContain(result, c => char.IsDigit(c));
    }

    [Fact]
    public void Texto_vacio_vuelve_igual()
    {
        Assert.Equal("", PiiRedactor.Redact(""));
    }
}
