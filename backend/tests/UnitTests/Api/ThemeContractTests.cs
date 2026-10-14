using System.Text.Json;
using System.Text.RegularExpressions;
using Themes.Infrastructure;

namespace UnitTests.Api;

/// <summary>
/// El contrato del tema (generado del registro de secciones de shared/types) y
/// el validador que lo usa al guardar. Lo que se cuida: que el backend conozca
/// exactamente los mismos tipos de sección que el editor y la tienda, que el
/// tema por defecto pase su propia validación, y que lo que antes rompía la
/// portada o metía un "javascript:" en un link no se pueda guardar.
/// </summary>
public partial class ThemeContractTests
{
    private static JsonElement Parse(string json) => JsonDocument.Parse(json).RootElement;

    private static IReadOnlyList<ThemeValidationError> ValidateSections(string sectionsJson) =>
        ThemeConfigValidator.Validate(Parse($$"""{ "colors": {}, "sections": {{sectionsJson}} }"""));

    private static string Section(string type, string data, string extra = "") =>
        $$"""{ "id": "s-{{type}}", "type": "{{type}}", "visible": true{{extra}}, "data": {{data}} }""";

    [Fact]
    public void Los_tipos_de_seccion_son_los_del_registro_de_TypeScript()
    {
        // El JSON lo genera el registro, pero si alguien agrega un tipo en TS y no
        // regenera, el test del admin falla; este cubre el caso inverso y que el
        // backend siga leyendo el archivo correcto.
        var envelope = File.ReadAllText(Path.Combine(RepoRoot(), "shared", "types", "src", "sections", "envelope.ts"));
        var block = SectionTypesRegex().Match(envelope);
        Assert.True(block.Success, "No se encontró SECTION_TYPES en envelope.ts");
        var tsTypes = QuotedRegex().Matches(block.Groups[1].Value).Select(m => m.Groups[1].Value).ToList();

        Assert.Equal(tsTypes, ThemeContract.SectionTypes);
    }

    [Fact]
    public void El_tema_por_defecto_es_valido_y_trae_secciones()
    {
        var config = Parse(ThemeDocument.DefaultConfig);
        Assert.Empty(ThemeConfigValidator.Validate(config));
        Assert.True(config.GetProperty("sections").GetArrayLength() > 0);
        Assert.Equal(ThemeContract.SchemaVersion, config.GetProperty("schemaVersion").GetInt32());
    }

    [Fact]
    public void Una_seccion_completa_de_cada_tipo_pasa()
    {
        var sections = string.Join(",", ThemeContract.SectionTypes.Select(t => Section(t, "{}")));
        Assert.Empty(ValidateSections($"[{sections}]"));
        Assert.Empty(ValidateSections($$"""
            [{{Section("faq", """{ "title": "Preguntas", "items": [{ "question": "¿Envían?", "answer": "Sí.", "label": "Envíos" }] }""",
                """, "name": "Mis preguntas", "hideOn": "mobile", "style": { "background": "custom", "backgroundColor": "250 240 230", "paddingTop": "lg", "align": "left" }""")}}]
            """));
    }

    [Theory]
    [InlineData("[null]", "no es válida")]
    [InlineData("""[{ "id": "x", "type": "no-existe", "visible": true, "data": {} }]""", "tipo que no existe")]
    [InlineData("""[{ "id": "x", "type": "faq", "visible": true, "data": null }]""", "no tiene datos válidos")]
    [InlineData("""[{ "id": "x", "type": "faq", "visible": true }]""", "no tiene datos válidos")]
    [InlineData("""[{ "id": "x", "type": "promo-banners", "visible": true, "data": { "banners": [null] } }]""", "no es válido")]
    [InlineData("""[{ "id": "x", "type": "faq", "visible": true, "data": { "items": "muchas" } }]""", "no es una lista")]
    [InlineData("""[{ "id": "x", "type": "faq", "visible": "si", "data": {} }]""", "sí o no")]
    [InlineData("""[{ "id": "", "type": "faq", "visible": true, "data": {} }]""", "identificador")]
    [InlineData("""[{ "id": "x", "type": "faq", "visible": true, "hideOn": "tablet", "data": {} }]""", "dispositivos")]
    [InlineData("""[{ "id": "x", "type": "faq", "visible": true, "style": { "backgroundColor": "red" }, "data": {} }]""", "color de fondo")]
    [InlineData("""[{ "id": "x", "type": "hero-video", "visible": true, "data": { "height": "gigante" } }]""", "opción válida")]
    public void Lo_que_rompia_la_portada_no_se_guarda(string sections, string message)
    {
        var errors = ValidateSections(sections);
        Assert.NotEmpty(errors);
        Assert.Contains(errors, e => e.Message.Contains(message, StringComparison.Ordinal));
        // El mensaje nombra la sección (el comercio tiene que saber cuál arreglar).
        Assert.StartsWith("La sección 1", errors[0].Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Ids_repetidos_y_demasiadas_secciones()
    {
        var dup = ValidateSections($"[{Section("faq", "{}")},{Section("faq", "{}")}]");
        Assert.Contains(dup, e => e.Message.Contains("repite el identificador", StringComparison.Ordinal));

        var many = string.Join(",", Enumerable.Range(0, ThemeContract.Limit("maxSections") + 1)
            .Select(i => $$"""{ "id": "s{{i}}", "type": "institutional", "visible": true, "data": {} }"""));
        Assert.Contains(ValidateSections($"[{many}]"), e => e.Path == "sections");
    }

    [Fact]
    public void Textos_con_largo_maximo_y_listas_con_tope()
    {
        var longTitle = new string('a', ThemeContract.Limit("shortText") + 1);
        var errors = ValidateSections($$"""[{{Section("institutional", $$"""{ "title": "{{longTitle}}" }""")}}]""");
        var error = Assert.Single(errors);
        Assert.Equal("sections[0].data.title", error.Path);
        Assert.Contains("el título tiene 201 caracteres y el máximo es 200", error.Message, StringComparison.Ordinal);

        var items = string.Join(",", Enumerable.Range(0, 5).Select(_ => """{ "title": "x" }"""));
        Assert.Contains(ValidateSections($$"""[{{Section("info-bar", $$"""{ "items": [{{items}}] }""")}}]"""),
            e => e.Message.Contains("el máximo es 4", StringComparison.Ordinal));
    }

    [Theory]
    [InlineData("/productos", true)]
    [InlineData("productos?categoria=x", true)]
    [InlineData("#contacto", true)]
    [InlineData("https://wa.me/5491100000000", true)]
    [InlineData("http://example.com", true)]
    [InlineData("mailto:hola@example.com", true)]
    [InlineData("tel:+541100000000", true)]
    [InlineData("javascript:alert(1)", false)]
    [InlineData("JavaScript:alert(1)", false)]
    [InlineData(" java\nscript:alert(1)", false)]
    [InlineData("data:text/html,<script>alert(1)</script>", false)]
    [InlineData("vbscript:msgbox(1)", false)]
    public void Los_links_admiten_rutas_web_mail_y_telefono_pero_no_scripts(string link, bool ok)
    {
        Assert.Equal(ok, ThemeConfigValidator.IsSafeLink(link));
        var json = JsonSerializer.Serialize(new { link });
        var errors = ValidateSections($"[{Section("image-text", json)}]");
        Assert.Equal(ok, errors.Count == 0);
    }

    [Fact]
    public void Las_imagenes_solo_por_http_o_rutas()
    {
        Assert.Empty(ValidateSections($$"""[{{Section("brands", """{ "logos": [{ "image": "https://cdn.x/a.png" }, { "image": "/marca/b.svg" }] }""")}}]"""));
        Assert.NotEmpty(ValidateSections($$"""[{{Section("brands", """{ "logos": [{ "image": "data:image/png;base64,AAAA" }] }""")}}]"""));
        Assert.NotEmpty(ValidateSections($$"""[{{Section("carousel", """{ "slides": [null] }""")}}]"""));
        Assert.NotEmpty(ValidateSections($$"""[{{Section("carousel", """{ "slides": [{ "mobileImage": "javascript:alert(1)" }] }""")}}]"""));
    }

    [Theory]
    [InlineData("\"2026-11-20T02:59:00.000Z\"", true)]
    [InlineData("\"2026-11-19T23:59-03:00\"", true)]
    [InlineData("\"\"", true)]
    [InlineData("\"2026-11-20T02:59:00\"", false)] // sin zona: se leería distinto según el servidor
    [InlineData("\"2026-02-30T10:00:00Z\"", false)]
    [InlineData("\"mañana\"", false)]
    [InlineData("1763600000000", false)]
    public void La_fecha_de_cierre_es_ISO_con_zona(string endsAt, bool ok)
    {
        var errors = ValidateSections($$"""[{{Section("countdown-offer", $$"""{ "endsAt": {{endsAt}} }""")}}]""");
        Assert.Equal(ok, errors.Count == 0);
        if (!ok) Assert.Contains("la fecha en que termina", errors[0].Message, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("5", true)]
    [InlineData("0", true)]
    [InlineData("120", true)]
    [InlineData("121", false)]
    [InlineData("-1", false)]
    [InlineData("2.5", false)]
    [InlineData("\"5\"", false)]
    public void Los_numeros_son_enteros_dentro_de_su_rango(string seconds, bool ok)
    {
        var errors = ValidateSections($$"""[{{Section("promo-popup", $$"""{ "delaySeconds": {{seconds}} }""")}}]""");
        Assert.Equal(ok, errors.Count == 0);
        if (!ok)
            Assert.Contains("los segundos de espera tiene que ser un número entero entre 0 y 120", errors[0].Message, StringComparison.Ordinal);
    }

    [Fact]
    public void El_texto_con_formato_acepta_titulos_listas_citas_y_links_seguros()
    {
        const string body = """
            { "type": "doc", "content": [
              { "type": "heading", "attrs": { "level": 3 }, "content": [{ "type": "text", "text": "Envíos" }] },
              { "type": "paragraph", "content": [
                { "type": "text", "text": "a todo el país", "marks": [{ "type": "bold" }, { "type": "italic" }] },
                { "type": "hardBreak" },
                { "type": "text", "text": "tarifas", "marks": [{ "type": "link", "attrs": { "href": "/paginas/envios" } }] } ] },
              { "type": "paragraph" },
              { "type": "bulletList", "content": [{ "type": "listItem", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Correo" }] }] }] },
              { "type": "blockquote", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Rápido" }] }] } ] }
            """;
        Assert.Empty(ValidateSections($$"""[{{Section("rich-text", $$"""{ "body": {{body}} }""")}}]"""));
    }

    [Theory]
    [InlineData("\"<p>hola</p>\"", "no es un texto con formato válido")]
    [InlineData("""{ "type": "paragraph" }""", "no es un texto con formato válido")]
    [InlineData("""{ "type": "doc", "content": [{ "type": "image", "attrs": { "src": "x" } }] }""", "no se puede guardar («image»)")]
    [InlineData("""{ "type": "doc", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "x", "marks": [{ "type": "link", "attrs": { "href": "javascript:alert(1)" } }] }] }] }""", "link que no es válido")]
    [InlineData("""{ "type": "doc", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "x", "marks": [{ "type": "code" }] }] }] }""", "formato que no se puede guardar")]
    [InlineData("""{ "type": "doc", "content": [{ "type": "heading", "attrs": { "level": 1 } }] }""", "nivel que no existe")]
    [InlineData("""{ "type": "doc", "content": [{ "type": "bulletList", "content": [{ "type": "paragraph" }] }] }""", "elemento que no es válido")]
    [InlineData("""{ "type": "doc", "content": [{ "type": "paragraph", "content": [{ "type": "text" }] }] }""", "texto que no es válido")]
    public void El_texto_con_formato_rechaza_html_nodos_desconocidos_y_links_peligrosos(string body, string message)
    {
        var errors = ValidateSections($$"""[{{Section("rich-text", $$"""{ "body": {{body}} }""")}}]""");
        Assert.Contains(errors, e => e.Path == "sections[0].data.body" && e.Message.Contains(message, StringComparison.Ordinal));
    }

    [Fact]
    public void El_texto_con_formato_tiene_tope_de_tamano_y_de_anidamiento()
    {
        var text = new string('a', 25_000);
        var big = $$"""{ "type": "doc", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "{{text}}" }] }] }""";
        Assert.Contains(ValidateSections($$"""[{{Section("rich-text", $$"""{ "body": {{big}} }""")}}]"""),
            e => e.Message.Contains("es demasiado largo", StringComparison.Ordinal));

        var deep = """{ "type": "paragraph" }""";
        for (var i = 0; i < 8; i++) deep = $$"""{ "type": "blockquote", "content": [{{deep}}] }""";
        Assert.Contains(ValidateSections($$"""[{{Section("rich-text", $$"""{ "body": { "type": "doc", "content": [{{deep}}] } }""")}}]"""),
            e => e.Message.Contains("niveles anidados", StringComparison.Ordinal));
    }

    private static string RepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !Directory.Exists(Path.Combine(dir.FullName, "shared", "types")))
            dir = dir.Parent;
        return dir?.FullName ?? throw new InvalidOperationException("No se encontró la raíz del repo.");
    }

    [GeneratedRegex(@"SECTION_TYPES\s*=\s*\[([^\]]*)\]", RegexOptions.Singleline)]
    private static partial Regex SectionTypesRegex();

    [GeneratedRegex(@"'([^']+)'")]
    private static partial Regex QuotedRegex();
}
