using System.Text.Json;
using Api.Ai.Catalog;

namespace UnitTests.Api.Ai.Catalog;

public sealed class AiCatalogJsonTests
{
    private const string ValidProposal = """
    {
      "descripcion": "Un taladro percutor.",
      "seo_titulo": "Taladro Bosch",
      "seo_descripcion": "Taladro percutor Bosch de 600 W.",
      "atributos": [
        { "id": "COLOR", "valor_id": "52049", "valor": "Negro", "unidad": "", "falta_dato": false },
        { "id": "GTIN", "valor_id": "", "valor": "", "unidad": "", "falta_dato": true },
        { "id": "POWER", "valor_id": "", "valor": 600, "unidad": "W", "falta_dato": false }
      ]
    }
    """;

    [Fact]
    public void ParseProposal_lee_falta_dato()
    {
        var proposal = AiCatalogJson.ParseProposal(ValidProposal)!;

        Assert.Equal("Un taladro percutor.", proposal.Description);
        Assert.Equal("Taladro Bosch", proposal.SeoTitle);
        Assert.Equal(3, proposal.Attributes.Count);
        Assert.Equal(new AiCatalogAttributeProposal("COLOR", "52049", "Negro", null, false), proposal.Attributes[0]);
        Assert.True(proposal.Attributes[1].Missing);
        Assert.Null(proposal.Attributes[1].ValueName);
        // Un número suelto se lee como texto, con su unidad.
        Assert.Equal(new AiCatalogAttributeProposal("POWER", null, "600", "W", false), proposal.Attributes[2]);
    }

    [Fact]
    public void ParseProposal_tolera_un_bloque_de_codigo()
    {
        var wrapped = "```json\n" + ValidProposal + "\n```";

        Assert.NotNull(AiCatalogJson.ParseProposal(wrapped));
        Assert.NotNull(AiCatalogJson.ParseProposal("Acá va la ficha: " + ValidProposal));
    }

    [Fact]
    public void ParseProposal_sin_atributos_es_valido_con_lista_vacia()
    {
        var proposal = AiCatalogJson.ParseProposal("""{ "descripcion": "x", "seo_titulo": "y", "seo_descripcion": "z" }""")!;

        Assert.Empty(proposal.Attributes);
    }

    [Theory]
    [InlineData("no es json")]
    [InlineData("")]
    [InlineData("""{ "seo_titulo": "y", "seo_descripcion": "z" }""")]
    [InlineData("""{ "descripcion": "x", "seo_titulo": 4, "seo_descripcion": "z" }""")]
    [InlineData("""[ 1, 2 ]""")]
    public void ParseProposal_invalido_da_null(string text)
    {
        Assert.Null(AiCatalogJson.ParseProposal(text));
    }

    private const string ValidJudge = """
    { "inventa_datos": false, "tono_y_voseo": 5, "claridad": 4, "atributos_ok": true, "puntaje": 4, "motivos": [ "Falta mencionar el maletín." ] }
    """;

    [Fact]
    public void ParseJudge_lee_la_rubrica()
    {
        var judge = AiCatalogJson.ParseJudge(ValidJudge)!;

        Assert.False(judge.InventaDatos);
        Assert.Equal(5, judge.TonoYVoseo);
        Assert.Equal(4, judge.Claridad);
        Assert.True(judge.AtributosOk);
        Assert.Equal(4, judge.Puntaje);
        Assert.Equal(["Falta mencionar el maletín."], judge.Motivos);
        Assert.True(judge.Passes);
    }

    [Theory]
    [InlineData("""{ "inventa_datos": false, "tono_y_voseo": 5, "claridad": 4, "atributos_ok": true, "puntaje": 7, "motivos": [] }""")]
    [InlineData("""{ "inventa_datos": false, "tono_y_voseo": 5, "claridad": 4, "atributos_ok": true, "puntaje": 0, "motivos": [] }""")]
    [InlineData("""{ "inventa_datos": false, "tono_y_voseo": 9, "claridad": 4, "atributos_ok": true, "puntaje": 4, "motivos": [] }""")]
    [InlineData("""{ "tono_y_voseo": 5, "claridad": 4, "atributos_ok": true, "puntaje": 4, "motivos": [] }""")]
    [InlineData("basura")]
    public void ParseJudge_fuera_de_rango_o_incompleto_da_null(string text)
    {
        Assert.Null(AiCatalogJson.ParseJudge(text));
    }

    [Fact]
    public void Inventa_datos_no_pasa_con_puntaje_5()
    {
        Assert.False(new AiCatalogJudgeResult(true, 5, 5, true, 5, []).Passes);
        Assert.False(new AiCatalogJudgeResult(false, 5, 5, true, 3, []).Passes);
        Assert.True(new AiCatalogJudgeResult(false, 3, 3, false, 4, []).Passes);
    }

    [Fact]
    public void Los_esquemas_piden_todos_los_campos_y_no_aceptan_extras()
    {
        var write = AiCatalogJson.WriteSchema;
        var judge = AiCatalogJson.JudgeSchema;

        Assert.Equal(JsonValueKind.Object, write.ValueKind);
        Assert.Equal(["descripcion", "seo_titulo", "seo_descripcion", "atributos"],
            write.GetProperty("required").EnumerateArray().Select(e => e.GetString()));
        Assert.False(write.GetProperty("additionalProperties").GetBoolean());
        var item = write.GetProperty("properties").GetProperty("atributos").GetProperty("items");
        Assert.Equal(["id", "valor_id", "valor", "unidad", "falta_dato"],
            item.GetProperty("required").EnumerateArray().Select(e => e.GetString()));
        Assert.Equal(["inventa_datos", "tono_y_voseo", "claridad", "atributos_ok", "puntaje", "motivos"],
            judge.GetProperty("required").EnumerateArray().Select(e => e.GetString()));
    }
}
