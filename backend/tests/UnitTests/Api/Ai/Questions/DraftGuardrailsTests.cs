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

    [Theory]
    [InlineData("escribime por wa.me/5491155551234")]
    [InlineData("mirá bit.ly/x")]
    [InlineData("entrá a t.me/canal")]
    [InlineData("linktr.ee/tienda")]
    [InlineData("la web es tienda.io")]
    public void Links_acortados_y_dominios_sueltos_avisan(string draft)
    {
        Assert.Contains(DraftGuardrails.Check(draft, Facts()), w => w.Code == "link");
    }

    [Fact]
    public void Un_mail_solo_no_es_un_link()
    {
        Assert.DoesNotContain(DraftGuardrails.Check("a@b.com", Facts()), w => w.Code == "link");
    }

    [Theory]
    [InlineData("seguinos en @tienda_ok")]
    [InlineData("mi instagram: tienda_ok")]
    [InlineData("mi whatsapp es 11 5555 1234")]
    [InlineData("agregame a telegram @juan")]
    [InlineData("wsp 1155551234")]
    public void Usuarios_de_redes_avisan_como_contacto(string draft)
    {
        Assert.Contains(DraftGuardrails.Check(draft, Facts()), w => w.Code == "contact-data");
    }

    [Fact]
    public void Un_mail_no_se_toma_por_usuario_y_el_arroba_suelto_no_avisa()
    {
        Assert.DoesNotContain(DraftGuardrails.Check("nos vemos @ la tarde", Facts()), w => w.Message.Contains("copió"));
        Assert.Empty(DraftGuardrails.Check("Te respondemos por whatsapp de la tienda.", Facts()));
    }

    [Fact]
    public void Copiar_la_mascara_avisa_con_su_propio_mensaje()
    {
        var warnings = DraftGuardrails.Check($"Te escribo a {PiiRedactor.Mask}", Facts());

        var warning = Assert.Single(warnings);
        Assert.Equal("contact-data", warning.Code);
        Assert.Equal("El borrador copió un dato oculto del comprador.", warning.Message);
    }

    [Theory]
    [InlineData("Te llega pasado mañana")]
    [InlineData("Sale esta semana")]
    [InlineData("Lo recibís el 3 de noviembre")]
    [InlineData("Llega en 24hs")]
    [InlineData("Llega dentro de 3 días")]
    [InlineData("Demora entre 3 y 5 días hábiles")]
    [InlineData("Demora 3 o 4 días")]
    [InlineData("Llega la semana que viene")]
    [InlineData("Llega a fin de mes")]
    [InlineData("Te lo despacho hoy")]
    [InlineData("Llega el 3/11")]
    [InlineData("Te llega el lunes")]
    public void Promesas_de_fecha_avisan(string draft)
    {
        Assert.Equal("delivery-date", Assert.Single(DraftGuardrails.Check(draft, Facts())).Code);
    }

    [Theory]
    [InlineData("mañana a la mañana te confirmo")]
    [InlineData("atendemos de lunes a viernes")]
    [InlineData("Atendemos 24/7")]
    [InlineData("Pesa 1/2 kilo")]
    [InlineData("Hoy tenemos stock")]
    public void Sin_promesa_de_entrega_no_avisa(string draft)
    {
        Assert.Empty(DraftGuardrails.Check(draft, Facts()));
    }

    [Fact]
    public void Texto_nulo_no_explota()
    {
        Assert.Empty(DraftGuardrails.Check(null!, Facts()));
    }

    [Fact]
    public void Montos_conocidos_repetidos_se_nombran_una_vez_y_en_orden()
    {
        var warning = Assert.Single(DraftGuardrails.Check("$ 1.000", Facts(amounts: [1_500_000, 1_200_000, 1_500_000])));

        Assert.Contains("$ 12.000 o $ 15.000.", warning.Message);
    }

    [Theory]
    [InlineData("Pesa 1.5kg/caja")]
    [InlineData("Mide 2.5mts/caja")]
    [InlineData("Trae 0.5lt/botella")]
    [InlineData("Hola.Me llamo Juan")]
    public void Medidas_y_oraciones_pegadas_no_son_links(string draft)
    {
        Assert.DoesNotContain(DraftGuardrails.Check(draft, Facts()), w => w.Code == "link");
    }

    [Theory]
    [InlineData("Despachamos dentro de las 24hs")]
    [InlineData("Llega en las próximas 48 hs")]
    [InlineData("Demora 72 horas")]
    public void Plazos_en_horas_sueltos_avisan(string draft)
    {
        Assert.Equal("delivery-date", Assert.Single(DraftGuardrails.Check(draft, Facts())).Code);
    }

    [Fact]
    public void Un_texto_enorme_no_lanza_por_timeout_de_regex()
    {
        var draft = string.Concat(Enumerable.Repeat("a.", 200_000)) + "!";

        var ex = Record.Exception(() => DraftGuardrails.Check(draft, Facts()));

        Assert.Null(ex);
    }
}
