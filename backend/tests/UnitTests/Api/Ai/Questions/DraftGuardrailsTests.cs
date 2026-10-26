using Api.Ai.Questions;

namespace UnitTests.Api.Ai.Questions;

public sealed class DraftGuardrailsTests
{
    private static DraftFacts Facts(int max = 2000, bool delivery = false, params long[] amounts) =>
        new(max, amounts, delivery);

    [Theory]
    [InlineData("mirá www.tienda.com.ar")]
    [InlineData("https://x.com")]
    public void Link_avisa(string draft)
    {
        var warnings = DraftGuardrails.Check(draft, Facts());

        Assert.Single(warnings);
        Assert.Equal("link", warnings[0].Code);
    }

    [Fact]
    public void Mail_y_telefono_avisan()
    {
        var warnings = DraftGuardrails.Check("escribime a a@b.com o al 11 5555-1234", Facts());

        Assert.Contains(warnings, w => w.Code == "contact-data");
    }

    [Fact]
    public void Monto_que_coincide_no_avisa()
    {
        Assert.Empty(DraftGuardrails.Check("Sale $ 15.000", Facts(amounts: 1_500_000)));
    }

    [Fact]
    public void Monto_con_centavos()
    {
        Assert.Empty(DraftGuardrails.Check("$ 15.000,50", Facts(amounts: 1_500_050)));
    }

    [Fact]
    public void Monto_distinto_avisa()
    {
        var warnings = DraftGuardrails.Check("Sale $ 14.000", Facts(amounts: 1_500_000));

        var warning = Assert.Single(warnings);
        Assert.Equal("amount", warning.Code);
        Assert.Contains("$ 14.000", warning.Message);
        Assert.Contains("$ 15.000", warning.Message);
    }

    [Fact]
    public void Monto_con_pesos_atras_se_chequea()
    {
        Assert.Equal("amount", Assert.Single(DraftGuardrails.Check("Sale 14.000 pesos", Facts(amounts: 1_500_000))).Code);
    }

    [Fact]
    public void Cualquier_monto_conocido_cuenta_y_cada_monto_se_chequea()
    {
        Assert.Empty(DraftGuardrails.Check("$ 15.000 o $ 12.000", Facts(amounts: [1_500_000, 1_200_000])));
        Assert.Single(DraftGuardrails.Check("$ 15.000 o $ 9.000", Facts(amounts: [1_500_000, 1_200_000])));
    }

    [Fact]
    public void Cantidades_no_son_montos()
    {
        Assert.Empty(DraftGuardrails.Check("Quedan 3 unidades", Facts(amounts: 1_500_000)));
    }

    [Fact]
    public void Pasarse_del_maximo_avisa()
    {
        var warnings = DraftGuardrails.Check(new string('a', 351), Facts(max: 350));

        Assert.Equal("too-long", Assert.Single(warnings).Code);
    }

    [Fact]
    public void Fecha_sin_seguimiento_avisa()
    {
        Assert.Equal("delivery-date", Assert.Single(DraftGuardrails.Check("Te llega el lunes", Facts(delivery: false))).Code);
        Assert.Empty(DraftGuardrails.Check("Te llega el lunes", Facts(delivery: true)));
    }

    [Fact]
    public void Limites_por_canal()
    {
        Assert.Equal(350, DraftLimits.MaxLength(DraftChannel.MeliMessage));
        Assert.Equal(2000, DraftLimits.MaxLength(DraftChannel.MeliQuestion));
        Assert.Equal(2000, DraftLimits.MaxLength(DraftChannel.SupportChat));
        Assert.Equal(2000, DraftLimits.MaxLength(DraftChannel.Contact));
    }

    [Fact]
    public void Un_texto_limpio_no_avisa()
    {
        Assert.Empty(DraftGuardrails.Check("Hola, sí, lo tenemos en stock.", Facts()));
    }
}
