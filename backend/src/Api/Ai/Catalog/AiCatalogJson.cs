using System.Text.Json;

namespace Api.Ai.Catalog;

/// <summary>Lo que devuelve el evaluador: la rúbrica. <c>Passes</c> es la regla de la spec (puntaje 4 o más y sin datos inventados).</summary>
public sealed record AiCatalogJudgeResult(
    bool InventaDatos, int TonoYVoseo, int Claridad, bool AtributosOk, int Puntaje, IReadOnlyList<string> Motivos)
{
    public bool Passes => Puntaje >= 4 && !InventaDatos;
}

/// <summary>
/// Los esquemas de las dos tareas y la lectura de sus respuestas. Los esquemas usan solo tipos simples y todos los
/// campos son obligatorios (lo que no aplica va como texto vacío), que es lo que aceptan todos los proveedores.
/// Los <c>Parse*</c> toleran el JSON envuelto en un bloque de código o con texto alrededor y devuelven null si no valida.
/// </summary>
public static class AiCatalogJson
{
    private const string WriteSchemaText = """
        {
          "type": "object",
          "properties": {
            "descripcion": { "type": "string" },
            "seo_titulo": { "type": "string" },
            "seo_descripcion": { "type": "string" },
            "atributos": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "id": { "type": "string" },
                  "valor_id": { "type": "string" },
                  "valor": { "type": "string" },
                  "unidad": { "type": "string" },
                  "falta_dato": { "type": "boolean" }
                },
                "required": ["id", "valor_id", "valor", "unidad", "falta_dato"],
                "additionalProperties": false
              }
            }
          },
          "required": ["descripcion", "seo_titulo", "seo_descripcion", "atributos"],
          "additionalProperties": false
        }
        """;

    private const string JudgeSchemaText = """
        {
          "type": "object",
          "properties": {
            "inventa_datos": { "type": "boolean" },
            "tono_y_voseo": { "type": "integer" },
            "claridad": { "type": "integer" },
            "atributos_ok": { "type": "boolean" },
            "puntaje": { "type": "integer" },
            "motivos": { "type": "array", "items": { "type": "string" } }
          },
          "required": ["inventa_datos", "tono_y_voseo", "claridad", "atributos_ok", "puntaje", "motivos"],
          "additionalProperties": false
        }
        """;

    /// <summary>Esquema de <c>CatalogWrite</c>: descripcion, seo_titulo, seo_descripcion y atributos (id, valor_id, valor, unidad, falta_dato).</summary>
    public static JsonElement WriteSchema { get; } = Schema(WriteSchemaText);

    /// <summary>Esquema de <c>CatalogJudge</c>: inventa_datos, tono_y_voseo, claridad, atributos_ok, puntaje y motivos.</summary>
    public static JsonElement JudgeSchema { get; } = Schema(JudgeSchemaText);

    public static AiCatalogProposal? ParseProposal(string? text)
    {
        if (Root(text) is not { } root) return null;
        if (Text(root, "descripcion") is not { } description
            || Text(root, "seo_titulo") is not { } seoTitle
            || Text(root, "seo_descripcion") is not { } seoDescription)
            return null;

        var attributes = new List<AiCatalogAttributeProposal>();
        if (root.TryGetProperty("atributos", out var raw))
        {
            if (raw.ValueKind != JsonValueKind.Array) return null;
            foreach (var entry in raw.EnumerateArray())
            {
                if (entry.ValueKind != JsonValueKind.Object || Loose(entry, "id") is not { } id) continue;
                var missing = entry.TryGetProperty("falta_dato", out var flag) && flag.ValueKind == JsonValueKind.True;
                attributes.Add(new AiCatalogAttributeProposal(id, Loose(entry, "valor_id"), Loose(entry, "valor"), Loose(entry, "unidad"), missing));
            }
        }
        return new AiCatalogProposal(description, seoTitle, seoDescription, attributes);
    }

    public static AiCatalogJudgeResult? ParseJudge(string? text)
    {
        if (Root(text) is not { } root) return null;
        if (!TryBool(root, "inventa_datos", out var invents)
            || !TryBool(root, "atributos_ok", out var attributesOk)
            || !TryScore(root, "tono_y_voseo", out var tone)
            || !TryScore(root, "claridad", out var clarity)
            || !TryScore(root, "puntaje", out var score))
            return null;

        var reasons = new List<string>();
        if (root.TryGetProperty("motivos", out var raw) && raw.ValueKind == JsonValueKind.Array)
        {
            foreach (var reason in raw.EnumerateArray())
                if (reason.ValueKind == JsonValueKind.String && reason.GetString()?.Trim() is { Length: > 0 } clean)
                    reasons.Add(clean);
        }
        return new AiCatalogJudgeResult(invents, tone, clarity, attributesOk, score, reasons);
    }

    private static JsonElement Schema(string text)
    {
        using var doc = JsonDocument.Parse(text);
        return doc.RootElement.Clone();
    }

    /// <summary>El primer objeto JSON del texto (sin el bloque de código ni lo que el modelo diga alrededor).</summary>
    private static JsonElement? Root(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        var start = text.IndexOf('{');
        var end = text.LastIndexOf('}');
        if (start < 0 || end <= start) return null;
        try
        {
            using var doc = JsonDocument.Parse(text[start..(end + 1)]);
            return doc.RootElement.ValueKind == JsonValueKind.Object ? doc.RootElement.Clone() : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    /// <summary>Un texto obligatorio: tiene que venir como string.</summary>
    private static string? Text(JsonElement e, string name) =>
        e.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.String ? p.GetString()?.Trim() : null;

    /// <summary>Un valor de atributo: texto o número (el modelo a veces manda 600 en vez de "600"); vacío = null.</summary>
    private static string? Loose(JsonElement e, string name)
    {
        if (!e.TryGetProperty(name, out var p)) return null;
        var value = p.ValueKind switch
        {
            JsonValueKind.String => p.GetString(),
            JsonValueKind.Number => p.GetRawText(),
            _ => null,
        };
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private static bool TryBool(JsonElement e, string name, out bool value)
    {
        value = false;
        if (!e.TryGetProperty(name, out var p) || p.ValueKind is not (JsonValueKind.True or JsonValueKind.False)) return false;
        value = p.GetBoolean();
        return true;
    }

    private static bool TryScore(JsonElement e, string name, out int value)
    {
        value = 0;
        return e.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.Number && p.TryGetInt32(out value) && value is >= 1 and <= 5;
    }
}
