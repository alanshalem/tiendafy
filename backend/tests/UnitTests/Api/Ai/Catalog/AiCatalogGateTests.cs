using Api.Ai.Catalog;
using Api.Meli;

namespace UnitTests.Api.Ai.Catalog;

public sealed class AiCatalogGateTests
{
    private const string Source = "Taladro percutor Bosch GSB 13 RE. Potencia 600 W.";

    private static string Text(int length) => new string('a', length - 1) + ".";

    private static readonly IReadOnlyList<MeliAttributeValue> Colors =
        [new("52049", "Rojo"), new("52050", "Azul")];

    private static MeliCategoryAttribute Attr(
        string id, MeliAttributeKind kind = MeliAttributeKind.Text, IReadOnlyList<MeliAttributeValue>? values = null,
        string[]? units = null, string? defaultUnit = null, int? maxLength = null, bool identifier = false) =>
        new(id, id, kind, values ?? [], units ?? [], defaultUnit, maxLength, Required: false, Relevant: true, identifier);

    private static AiCatalogProposal Proposal(
        string? description = null, string? seoTitle = null, string? seoDescription = null,
        params AiCatalogAttributeProposal[] attributes) =>
        new(description ?? Text(400), seoTitle ?? "Taladro Bosch 600 W", seoDescription ?? Text(100), attributes);

    private static AiCatalogAttributeProposal Value(string id, string value, string? unit = null) =>
        new(id, null, value, unit, false);

    [Fact]
    public void Propuesta_correcta_pasa_sin_notas()
    {
        var result = AiCatalogGate.Check(Proposal(), [], Source);

        Assert.True(result.Ok);
        Assert.Empty(result.Notes);
    }

    [Fact]
    public void Descripcion_corta_es_violacion()
    {
        var result = AiCatalogGate.Check(Proposal(description: Text(150)), [], Source);

        Assert.False(result.Ok);
        var violation = Assert.Single(result.Violations);
        Assert.Contains("200", violation);
    }

    [Fact]
    public void Descripcion_larga_y_SEO_fuera_de_largo_son_violaciones()
    {
        var result = AiCatalogGate.Check(
            Proposal(description: Text(3_001), seoTitle: Text(61), seoDescription: Text(69)), [], Source);

        Assert.Equal(3, result.Violations.Count);
    }

    [Theory]
    [InlineData("Llevalo a solo $ 15.000 hoy, con envío incluido y garantía oficial de fábrica.")]
    [InlineData("Salió en US$ 40 en otras tiendas y acá lo conseguís al mejor precio, con garantía.")]
    [InlineData("Cuesta 1500 pesos y rinde muchísimo más que cualquier otro taladro de su categoría.")]
    [InlineData("Precio de lista en ARS para todo el país con entrega rápida a domicilio asegurada.")]
    [InlineData("Valor de referencia en USD para importadores, con garantía y servicio técnico oficial.")]
    [InlineData("mirá www.tienda.com.ar para ver más modelos como este con entrega en todo el país.")]
    [InlineData("Más info en https://tienda.test/taladro con fotos y detalles técnicos del producto.")]
    [InlineData("Más info en tienda.com para ver más modelos como este con entrega en todo el país.")]
    [InlineData("escribinos a ventas@x.com y te asesoramos con la compra del taladro que necesitás.")]
    public void Precio_link_o_mail_en_el_texto_es_violacion(string text)
    {
        var padded = text + " " + Text(200);

        var result = AiCatalogGate.Check(Proposal(description: padded), [], Source);

        Assert.False(result.Ok);
        Assert.Single(result.Violations);
    }

    [Fact]
    public void El_mismo_control_vale_para_el_SEO()
    {
        var result = AiCatalogGate.Check(Proposal(seoDescription: "Taladro Bosch a $ 15.000 con envío gratis a todo el país, garantía oficial."), [], Source);

        Assert.False(result.Ok);
    }

    [Fact]
    public void Atributo_fuera_de_la_categoria_se_saca()
    {
        var result = AiCatalogGate.Check(
            Proposal(attributes: [Value("INVENTADO", "x"), Value("COLOR", "Rojo")]),
            [Attr("COLOR", MeliAttributeKind.List, Colors)], Source);

        Assert.DoesNotContain(result.Cleaned.Attributes, a => a.Id == "INVENTADO");
        Assert.Single(result.Cleaned.Attributes);
        var violation = Assert.Single(result.Violations);
        Assert.Contains("INVENTADO", violation);
    }

    [Fact]
    public void Atributo_repetido_es_violacion()
    {
        var result = AiCatalogGate.Check(
            Proposal(attributes: [Value("COLOR", "Rojo"), Value("COLOR", "Azul")]),
            [Attr("COLOR", MeliAttributeKind.List, Colors)], Source);

        Assert.Single(result.Cleaned.Attributes);
        Assert.Single(result.Violations);
    }

    [Fact]
    public void Valor_de_lista_no_permitido_queda_falta_dato()
    {
        var result = AiCatalogGate.Check(
            Proposal(attributes: [Value("COLOR", "Fucsia flúor")]),
            [Attr("COLOR", MeliAttributeKind.List, Colors)], Source);

        Assert.False(result.Ok);
        Assert.True(Assert.Single(result.Cleaned.Attributes).Missing);
    }

    [Fact]
    public void Valor_de_lista_se_normaliza_al_id()
    {
        var result = AiCatalogGate.Check(
            Proposal(attributes: [Value("COLOR", "rojo")]),
            [Attr("COLOR", MeliAttributeKind.List, Colors)], Source);

        Assert.True(result.Ok);
        var color = Assert.Single(result.Cleaned.Attributes);
        Assert.Equal("52049", color.ValueId);
        Assert.Equal("Rojo", color.ValueName);
        Assert.False(color.Missing);
    }

    [Fact]
    public void Valor_de_lista_por_id_tambien_vale()
    {
        var result = AiCatalogGate.Check(
            Proposal(attributes: [new("COLOR", "52050", null, null, false)]),
            [Attr("COLOR", MeliAttributeKind.List, Colors)], Source);

        Assert.True(result.Ok);
        Assert.Equal("Azul", Assert.Single(result.Cleaned.Attributes).ValueName);
    }

    [Fact]
    public void Numero_invalido_es_violacion_y_coma_decimal_se_acepta()
    {
        var asked = new[] { Attr("WEIGHT", MeliAttributeKind.Number) };

        var bad = AiCatalogGate.Check(Proposal(attributes: [Value("WEIGHT", "mucho")]), asked, Source);
        var good = AiCatalogGate.Check(Proposal(attributes: [Value("WEIGHT", "1,5")]), asked, Source);

        Assert.False(bad.Ok);
        Assert.True(good.Ok);
        Assert.Equal("1.5", Assert.Single(good.Cleaned.Attributes).ValueName);
    }

    [Fact]
    public void Numero_con_unidad_invalida_es_violacion()
    {
        var result = AiCatalogGate.Check(
            Proposal(attributes: [Value("LENGTH", "30 pulgadas")]),
            [Attr("LENGTH", MeliAttributeKind.NumberUnit, units: ["cm", "m"], defaultUnit: "cm")], Source);

        Assert.False(result.Ok);
        Assert.True(Assert.Single(result.Cleaned.Attributes).Missing);
    }

    [Fact]
    public void Numero_sin_unidad_usa_la_por_defecto()
    {
        var result = AiCatalogGate.Check(
            Proposal(attributes: [Value("LENGTH", "30")]),
            [Attr("LENGTH", MeliAttributeKind.NumberUnit, units: ["cm", "m"], defaultUnit: "cm")], Source);

        Assert.True(result.Ok);
        var length = Assert.Single(result.Cleaned.Attributes);
        Assert.Equal("30", length.ValueName);
        Assert.Equal("cm", length.Unit);
        Assert.Single(result.Notes);
    }

    [Fact]
    public void Numero_con_unidad_aparte_y_valida_pasa()
    {
        var result = AiCatalogGate.Check(
            Proposal(attributes: [Value("LENGTH", "2", "M")]),
            [Attr("LENGTH", MeliAttributeKind.NumberUnit, units: ["cm", "m"], defaultUnit: "cm")], Source);

        Assert.True(result.Ok);
        Assert.Equal("m", Assert.Single(result.Cleaned.Attributes).Unit);
    }

    [Fact]
    public void Texto_mas_largo_que_el_maximo_es_violacion()
    {
        var result = AiCatalogGate.Check(
            Proposal(attributes: [Value("NAME", "abcdef")]),
            [Attr("NAME", maxLength: 5)], Source);

        Assert.False(result.Ok);
    }

    [Fact]
    public void GTIN_que_no_esta_en_los_datos_queda_falta_dato_sin_violacion()
    {
        var result = AiCatalogGate.Check(
            Proposal(attributes: [Value("GTIN", "4006381333931")]),
            [Attr("GTIN", identifier: true)], Source);

        Assert.True(result.Ok);
        Assert.True(Assert.Single(result.Cleaned.Attributes).Missing);
        Assert.Contains("GTIN", Assert.Single(result.Notes));
    }

    [Fact]
    public void GTIN_textual_con_digito_invalido_queda_falta_dato()
    {
        var result = AiCatalogGate.Check(
            Proposal(attributes: [Value("GTIN", "4006381333932")]),
            [Attr("GTIN", identifier: true)], Source + " Código 4006381333932.");

        Assert.True(result.Ok);
        Assert.True(Assert.Single(result.Cleaned.Attributes).Missing);
        Assert.Single(result.Notes);
    }

    [Fact]
    public void GTIN_textual_y_valido_pasa()
    {
        var result = AiCatalogGate.Check(
            Proposal(attributes: [Value("GTIN", "4006381333931")]),
            [Attr("GTIN", identifier: true)], Source + " EAN 4006381 333931.");

        Assert.True(result.Ok);
        var gtin = Assert.Single(result.Cleaned.Attributes);
        Assert.False(gtin.Missing);
        Assert.Equal("4006381333931", gtin.ValueName);
        Assert.Empty(result.Notes);
    }

    [Fact]
    public void GTIN_armado_pegando_digitos_de_campos_distintos_no_es_textual()
    {
        // Dos números de campos vecinos (separados por un salto de línea) que juntos forman un GTIN válido.
        var result = AiCatalogGate.Check(
            Proposal(attributes: [Value("GTIN", "4006381333931")]),
            [Attr("GTIN", identifier: true)], Source + "\nStock 4006381\n333931 unidades.");

        Assert.True(Assert.Single(result.Cleaned.Attributes).Missing);
        Assert.Single(result.Notes);
    }

    [Theory]
    [InlineData("Profess")]
    [InlineData("GSB")]
    [InlineData("5")]
    public void Identificador_que_no_es_palabra_completa_o_es_muy_corto_queda_falta_dato(string model)
    {
        var result = AiCatalogGate.Check(
            Proposal(attributes: [Value("MODEL", model)]),
            [Attr("MODEL", identifier: true)], "Taladro Bosch Professional GSB 5 de 600 W.");

        Assert.True(result.Ok);
        Assert.True(Assert.Single(result.Cleaned.Attributes).Missing);
    }

    [Fact]
    public void Modelo_inventado_queda_falta_dato()
    {
        var result = AiCatalogGate.Check(
            Proposal(attributes: [Value("MODEL", "XR-500")]),
            [Attr("MODEL", identifier: true)], Source);

        Assert.True(result.Ok);
        Assert.True(Assert.Single(result.Cleaned.Attributes).Missing);
        Assert.Single(result.Notes);
    }

    [Fact]
    public void Modelo_textual_pasa_sin_distinguir_mayusculas()
    {
        var result = AiCatalogGate.Check(
            Proposal(attributes: [Value("MODEL", "gsb 13 re")]),
            [Attr("MODEL", identifier: true)], Source);

        Assert.False(Assert.Single(result.Cleaned.Attributes).Missing);
    }

    [Fact]
    public void Falta_dato_nunca_es_violacion_y_pierde_el_valor()
    {
        var result = AiCatalogGate.Check(
            Proposal(attributes: [new("COLOR", "52049", "Rojo", null, true)]),
            [Attr("COLOR", MeliAttributeKind.List, Colors)], Source);

        Assert.True(result.Ok);
        var color = Assert.Single(result.Cleaned.Attributes);
        Assert.True(color.Missing);
        Assert.Null(color.ValueId);
        Assert.Null(color.ValueName);
    }

    [Fact]
    public void Edicion_humana_acepta_GTIN_valido_que_no_esta_en_los_datos()
    {
        var violations = AiCatalogGate.CheckHumanEdit(
            [new("GTIN", null, "4006381333931", null, false)],
            [Attr("GTIN", identifier: true)], null, null, null);

        Assert.Empty(violations);
    }

    [Fact]
    public void Edicion_humana_rechaza_GTIN_invalido()
    {
        var violations = AiCatalogGate.CheckHumanEdit(
            [new("GTIN", null, "4006381333932", null, false)],
            [Attr("GTIN", identifier: true)], null, null, null);

        Assert.Single(violations);
    }

    [Fact]
    public void Edicion_humana_rechaza_valor_fuera_de_la_lista_y_atributo_ajeno()
    {
        var violations = AiCatalogGate.CheckHumanEdit(
            [new("COLOR", null, "Fucsia", null, false), new("OTRO", null, "x", null, false)],
            [Attr("COLOR", MeliAttributeKind.List, Colors)], null, null, null);

        Assert.Equal(2, violations.Count);
    }

    [Fact]
    public void Edicion_humana_limita_los_largos_maximos()
    {
        var violations = AiCatalogGate.CheckHumanEdit([], [], Text(3_001), Text(61), Text(161));

        Assert.Equal(3, violations.Count);
        Assert.Empty(AiCatalogGate.CheckHumanEdit([], [], "corta", "corto", "corto"));
    }

    [Fact]
    public void Edicion_humana_devuelve_los_atributos_normalizados()
    {
        var cleaned = AiCatalogGate.CleanHumanAttributes(
            [new("COLOR", null, "azul", null, false)],
            [Attr("COLOR", MeliAttributeKind.List, Colors)]);

        Assert.Empty(cleaned.Violations);
        Assert.Equal("52050", Assert.Single(cleaned.Attributes).ValueId);
    }
}
