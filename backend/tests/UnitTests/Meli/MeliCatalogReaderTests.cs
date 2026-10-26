using System.Text.Json;
using Api.Meli;

namespace UnitTests.Meli;

/// <summary>
/// La lectura de lo que devuelve Mercado Libre. Los JSON son los de la documentación oficial
/// (developers.mercadolibre.com.ar/es_ar/atributos y /es_ar/categoriza-productos, vistos el 26-oct-2026).
/// </summary>
public sealed class MeliCatalogReaderTests
{
    /// <summary>GET /categories/{id}/attributes: tags como objeto, unidades como {id, name}.</summary>
    public const string AttributesJson = """
    [
      { "id": "BRAND", "name": "Marca", "tags": { "required": true }, "value_type": "string", "value_max_length": 60,
        "values": [ { "id": "15438", "name": "Shure" } ] },
      { "id": "COLOR", "name": "Color", "tags": { "allow_variations": true }, "type": "color", "value_type": "list",
        "values": [ { "id": "52049", "name": "Negro", "metadata": { "rgb": "000000" } }, { "id": "51993", "name": "Rojo" } ] },
      { "id": "WIRELESS_RANGE", "name": "Alcance Inalámbrico", "tags": { }, "value_type": "number_unit", "value_max_length": 60,
        "allowed_units": [ { "id": "cm", "name": "cm" }, { "id": "m", "name": "m" } ], "default_unit": "cm" },
      { "id": "GTIN", "name": "GTIN", "tags": { "hidden": true, "multivalued": true, "conditional_required": true },
        "type": "product_identifier", "value_type": "string", "value_max_length": 60 },
      { "id": "MODEL", "name": "Modelo", "tags": { }, "value_type": "string", "value_max_length": 60 },
      { "id": "IS_KIT", "name": "Es kit", "tags": { }, "value_type": "boolean",
        "values": [ { "id": "242085", "name": "Sí" }, { "id": "242084", "name": "No" } ] },
      { "id": "WEIGHT_TOTAL", "name": "Peso", "tags": { "hidden": true }, "value_type": "number_unit" },
      { "id": "LINE", "name": "Línea", "tags": { "fixed": true }, "value_type": "list", "values": [ { "id": "1", "name": "Única" } ] },
      { "id": "PACKAGE_WEIGHT", "name": "Peso del paquete", "tags": { "hidden": true, "read_only": true }, "value_type": "number_unit" },
      { "id": "JAN", "name": "JAN", "tags": { "hidden": true }, "type": "product_identifier", "value_type": "string" },
      { "id": "POWER", "name": "Potencia", "tags": { }, "value_type": "number" }
    ]
    """;

    private static IReadOnlyList<MeliCategoryAttribute> Parse(string json)
    {
        using var doc = JsonDocument.Parse(json);
        return MeliCatalogReader.ParseAttributes(doc.RootElement);
    }

    [Fact]
    public void ParseAttributes_lee_tipo_valores_unidades_y_marcas()
    {
        var attributes = Parse(AttributesJson).ToDictionary(a => a.Id);

        var color = attributes["COLOR"];
        Assert.Equal(MeliAttributeKind.List, color.Kind);
        Assert.Equal(2, color.Values.Count);
        Assert.Equal(new MeliAttributeValue("52049", "Negro"), color.Values[0]);
        Assert.False(color.Required);

        var range = attributes["WIRELESS_RANGE"];
        Assert.Equal(MeliAttributeKind.NumberUnit, range.Kind);
        Assert.Equal(["cm", "m"], range.AllowedUnits);
        Assert.Equal("cm", range.DefaultUnit);
        Assert.Equal(60, range.MaxLength);

        Assert.True(attributes["BRAND"].Required);
        Assert.Equal(MeliAttributeKind.Text, attributes["BRAND"].Kind);
        Assert.Equal(MeliAttributeKind.Number, attributes["POWER"].Kind);
        Assert.Equal(MeliAttributeKind.Boolean, attributes["IS_KIT"].Kind);
        Assert.Equal("242085", attributes["IS_KIT"].Values[0].Id);
    }

    [Fact]
    public void ParseAttributes_marca_los_identificadores()
    {
        var attributes = Parse(AttributesJson).ToDictionary(a => a.Id);

        Assert.True(attributes["GTIN"].IsIdentifier);
        Assert.True(attributes["MODEL"].IsIdentifier);
        Assert.False(attributes["BRAND"].IsIdentifier);
        Assert.False(attributes["COLOR"].IsIdentifier);
    }

    [Fact]
    public void ParseAttributes_el_GTIN_condicional_cuenta_como_obligatorio_aunque_este_oculto()
    {
        var gtin = Parse(AttributesJson).Single(a => a.Id == "GTIN");

        Assert.True(gtin.Required);
    }

    [Fact]
    public void ParseAttributes_deja_afuera_ocultos_no_obligatorios_solo_lectura_y_fijos()
    {
        var ids = Parse(AttributesJson).Select(a => a.Id).ToList();

        Assert.DoesNotContain("WEIGHT_TOTAL", ids);   // oculto
        Assert.DoesNotContain("PACKAGE_WEIGHT", ids); // oculto y de solo lectura
        Assert.DoesNotContain("LINE", ids);           // fijo: ML lo completa solo
        Assert.DoesNotContain("JAN", ids);            // oculto
        Assert.Contains("GTIN", ids);                 // oculto, pero ML lo pide
    }

    [Fact]
    public void ParseAttributes_acepta_los_tags_como_lista()
    {
        // /technical_specs/input los manda como lista de textos.
        var attributes = Parse("""
        [ { "id": "GENDER", "name": "Género", "value_type": "list", "tags": [ "catalog_required", "required" ],
            "values": [ { "id": "339665", "name": "Mujer" } ] } ]
        """);

        Assert.True(Assert.Single(attributes).Required);
    }

    [Fact]
    public void ParseAttributes_con_relevancia_solo_marca_relevantes_los_de_prioridad_uno()
    {
        var attributes = Parse("""
        [ { "id": "A", "name": "A", "value_type": "string", "relevance": 1, "tags": { } },
          { "id": "B", "name": "B", "value_type": "string", "relevance": 3, "tags": { } } ]
        """).ToDictionary(a => a.Id);

        Assert.True(attributes["A"].Relevant);
        Assert.False(attributes["B"].Relevant);
    }

    [Fact]
    public void ParseAttributes_ignora_lo_que_no_es_una_lista_o_no_tiene_id()
    {
        Assert.Empty(Parse("""{ "message": "no" }"""));
        Assert.Empty(Parse("""[ { "name": "sin id", "value_type": "string" } ]"""));
    }

    [Fact]
    public void ParseSuggestions_ignora_las_que_no_tienen_categoria()
    {
        using var doc = JsonDocument.Parse("""
        [ { "domain_id": "MLA-CELLPHONES", "domain_name": "Celulares", "category_id": "MLA1055", "category_name": "Celulares y Smartphones",
            "attributes": [ { "id": "BRAND", "value_id": "9344", "value_name": "Apple" } ] },
          { "domain_id": "MLA-X", "domain_name": "Sin categoría" },
          { "category_id": "", "category_name": "Vacía" } ]
        """);

        var suggestions = MeliCatalogReader.ParseSuggestions(doc.RootElement);

        var only = Assert.Single(suggestions);
        Assert.Equal(new MeliCategorySuggestion("MLA1055", "Celulares y Smartphones", "Celulares"), only);
    }

    [Fact]
    public void ParseSuggestions_de_algo_que_no_es_lista_es_vacio()
    {
        using var doc = JsonDocument.Parse("""{ "message": "error" }""");

        Assert.Empty(MeliCatalogReader.ParseSuggestions(doc.RootElement));
    }
}
