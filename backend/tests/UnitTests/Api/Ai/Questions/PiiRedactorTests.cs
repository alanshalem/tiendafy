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

    [Theory]
    [InlineData("juan @gmail.com")]
    [InlineData("juan@ gmail.com")]
    [InlineData("juan arroba gmail punto com")]
    [InlineData("juan arroba gmail.com")]
    [InlineData("JUAN ARROBA GMAIL PUNTO COM")]
    public void Tapa_mails_disfrazados(string mail)
    {
        Assert.Equal("escribime a [dato oculto]", PiiRedactor.Redact($"escribime a {mail}"));
    }

    [Theory]
    [InlineData("11.5555.1234")]
    [InlineData("011.4555.1234")]
    [InlineData("$1500 1155551234")]
    [InlineData("$ 1155551234")]
    [InlineData("1155551234 pesos")]
    public void Tapa_telefonos_con_puntos_o_pegados_a_un_monto(string text)
    {
        var result = PiiRedactor.Redact(text);

        Assert.Contains(PiiRedactor.Mask, result);
        Assert.DoesNotContain(result, c => char.IsDigit(c));
    }

    [Fact]
    public void Un_monto_con_puntos_sigue_intacto_junto_a_un_telefono()
    {
        var result = PiiRedactor.Redact("$ 1.250.000 y 1.250.000 pesos, llamame al 11.5555.1234");

        Assert.Equal("$ 1.250.000 y 1.250.000 pesos, llamame al [dato oculto]", result);
    }

    [Fact]
    public void Texto_vacio_vuelve_igual()
    {
        Assert.Equal("", PiiRedactor.Redact(""));
    }
}
