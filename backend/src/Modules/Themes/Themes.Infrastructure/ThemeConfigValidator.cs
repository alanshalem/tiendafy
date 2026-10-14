using System.Text.Json;
using System.Text.RegularExpressions;

namespace Themes.Infrastructure;

/// <summary>Un problema de un tema que no se puede guardar: dónde (ruta JSON) y qué, en castellano.</summary>
public sealed record ThemeValidationError(string Path, string Message);

/// <summary>
/// Valida las secciones del inicio antes de guardar un tema (borrador,
/// publicar, programar).
///
/// Antes la API solo miraba que hubiera "colors" y "sections": un null en la
/// lista, una sección sin datos o un banner null se guardaban y tiraban la
/// portada entera; y un link "javascript:…" llegaba al href de la tienda. Las
/// reglas (tipos, campos, largos, topes) salen de <see cref="ThemeContract"/>,
/// generado del mismo registro que usan el editor y la tienda.
/// </summary>
public static partial class ThemeConfigValidator
{
    /// <summary>Tope del tema entero: cientos de KB ya es un error, no un diseño.</summary>
    public const int MaxConfigChars = 1_000_000;

    private const int MaxIdLength = 100;

    private static readonly HashSet<string> LinkSchemes = ["http", "https", "mailto", "tel"];
    private static readonly HashSet<string> MediaSchemes = ["http", "https"];

    /// <summary>Cómo se llama cada campo para el comercio (los mensajes son para él).</summary>
    private static readonly Dictionary<string, string> FieldNames = new()
    {
        ["title"] = "el título",
        ["subtitle"] = "el subtítulo",
        ["description"] = "la descripción",
        ["text"] = "el texto",
        ["buttonText"] = "el texto del botón",
        ["link"] = "el link",
        ["question"] = "la pregunta",
        ["answer"] = "la respuesta",
        ["quote"] = "la opinión",
        ["name"] = "el nombre",
        ["detail"] = "el detalle",
        ["image"] = "la imagen",
        ["images"] = "las imágenes",
        ["photo"] = "la foto",
        ["poster"] = "la imagen de respaldo",
        ["videoWebm"] = "el video WebM",
        ["videoMp4"] = "el video MP4",
        ["video"] = "el link del video",
        ["productIds"] = "los productos",
        ["banners"] = "los banners",
        ["items"] = "los ítems",
        ["label"] = "el nombre",
        ["icon"] = "el ícono",
    };

    public static IReadOnlyList<ThemeValidationError> Validate(JsonElement config)
    {
        var errors = new List<ThemeValidationError>();
        if (config.ValueKind != JsonValueKind.Object) return errors; // la forma la valida el endpoint

        if (config.TryGetProperty("schemaVersion", out var sv)
            && sv.ValueKind != JsonValueKind.Null
            && !(sv.ValueKind == JsonValueKind.Number && sv.TryGetInt32(out var v) && v >= 0))
        {
            errors.Add(new("schemaVersion", "La versión del diseño no es válida."));
        }

        if (!config.TryGetProperty("sections", out var sections) || sections.ValueKind != JsonValueKind.Array)
            return errors;

        var max = ThemeContract.Limit("maxSections");
        if (sections.GetArrayLength() > max)
            errors.Add(new("sections", $"La página de inicio tiene {sections.GetArrayLength()} secciones y el máximo es {max}."));

        var ids = new HashSet<string>(StringComparer.Ordinal);
        var index = 0;
        foreach (var section in sections.EnumerateArray())
        {
            ValidateSection(section, index, ids, errors);
            index++;
        }
        return errors;
    }

    private static void ValidateSection(JsonElement s, int index, HashSet<string> ids, List<ThemeValidationError> errors)
    {
        var path = $"sections[{index}]";
        var where = $"La sección {index + 1}";
        if (s.ValueKind != JsonValueKind.Object)
        {
            errors.Add(new(path, $"{where} no es válida (tiene que ser un objeto)."));
            return;
        }

        var type = s.TryGetProperty("type", out var t) && t.ValueKind == JsonValueKind.String ? t.GetString()! : null;
        if (type is null || !ThemeContract.TryGetSection(type, out var def))
        {
            errors.Add(new($"{path}.type", type is null
                ? $"{where} no dice de qué tipo es."
                : $"{where} es de un tipo que no existe («{type}»)."));
            return;
        }

        var name = s.TryGetProperty("name", out var n) && n.ValueKind == JsonValueKind.String ? n.GetString() : null;
        where = $"{where} («{(string.IsNullOrWhiteSpace(name) ? def.GetProperty("label").GetString() : name)}»)";

        if (!s.TryGetProperty("id", out var id) || id.ValueKind != JsonValueKind.String
            || string.IsNullOrWhiteSpace(id.GetString()) || id.GetString()!.Length > MaxIdLength)
            errors.Add(new($"{path}.id", $"{where} no tiene un identificador válido."));
        else if (!ids.Add(id.GetString()!))
            errors.Add(new($"{path}.id", $"{where} repite el identificador de otra sección."));

        if (s.TryGetProperty("visible", out var vis) && vis.ValueKind is not (JsonValueKind.True or JsonValueKind.False or JsonValueKind.Null))
            errors.Add(new($"{path}.visible", $"{where}: «visible» tiene que ser sí o no."));

        if (s.TryGetProperty("name", out var nm) && nm.ValueKind is not JsonValueKind.Null)
            CheckString(nm, ThemeContract.Limit("label"), $"{path}.name", $"{where}: el nombre", errors);

        if (s.TryGetProperty("hideOn", out var hide) && hide.ValueKind is not JsonValueKind.Null)
            CheckEnum(hide, ThemeContract.EnvelopeValues("hideOn"), $"{path}.hideOn", $"{where}: en qué dispositivos se ve", errors);

        if (s.TryGetProperty("style", out var style) && style.ValueKind is not JsonValueKind.Null)
            ValidateStyle(style, path, where, errors);

        if (!s.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Object)
        {
            errors.Add(new($"{path}.data", $"{where} no tiene datos válidos."));
            return;
        }
        ValidateFields(def.GetProperty("fields"), data, $"{path}.data", where, errors);
    }

    private static void ValidateStyle(JsonElement style, string path, string where, List<ThemeValidationError> errors)
    {
        if (style.ValueKind != JsonValueKind.Object)
        {
            errors.Add(new($"{path}.style", $"{where}: el diseño de la sección no es válido."));
            return;
        }
        var label = $"{where}: el diseño de la sección";
        if (style.TryGetProperty("background", out var bg) && bg.ValueKind is not JsonValueKind.Null)
            CheckEnum(bg, ThemeContract.EnvelopeValues("backgrounds"), $"{path}.style.background", $"{label} (fondo)", errors);
        foreach (var key in new[] { "paddingTop", "paddingBottom" })
            if (style.TryGetProperty(key, out var pad) && pad.ValueKind is not JsonValueKind.Null)
                CheckEnum(pad, ThemeContract.EnvelopeValues("spacings"), $"{path}.style.{key}", $"{label} (espaciado)", errors);
        if (style.TryGetProperty("align", out var align) && align.ValueKind is not JsonValueKind.Null)
            CheckEnum(align, ThemeContract.EnvelopeValues("aligns"), $"{path}.style.align", $"{label} (alineación)", errors);
        if (style.TryGetProperty("backgroundColor", out var color) && color.ValueKind is not JsonValueKind.Null
            && !(color.ValueKind == JsonValueKind.String && IsRgb(color.GetString()!)))
            errors.Add(new($"{path}.style.backgroundColor", $"{label}: el color de fondo no es válido."));
    }

    private static void ValidateFields(JsonElement fields, JsonElement data, string path, string where, List<ThemeValidationError> errors)
    {
        foreach (var field in fields.EnumerateObject())
        {
            if (!data.TryGetProperty(field.Name, out var value) || value.ValueKind == JsonValueKind.Null) continue;
            ValidateField(field.Value, value, $"{path}.{field.Name}", $"{where}: {FieldName(field.Name)}", errors);
        }
    }

    private static void ValidateField(JsonElement spec, JsonElement value, string path, string what, List<ThemeValidationError> errors)
    {
        switch (spec.GetProperty("kind").GetString())
        {
            case "string":
            case "text":
                CheckString(value, spec.GetProperty("max").GetInt32(), path, what, errors);
                break;
            case "url":
                if (CheckString(value, ThemeContract.Limit("url"), path, what, errors) && !IsSafe(value.GetString()!, LinkSchemes))
                    errors.Add(new(path, $"{what} no es un link válido (usá una dirección web, una ruta de la tienda, mailto: o tel:)."));
                break;
            case "media":
                if (CheckString(value, ThemeContract.Limit("url"), path, what, errors) && !IsSafe(value.GetString()!, MediaSchemes))
                    errors.Add(new(path, $"{what} no es una dirección de imagen o video válida."));
                break;
            case "boolean":
                if (value.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
                    errors.Add(new(path, $"{what} tiene que ser sí o no."));
                break;
            case "enum":
                CheckEnum(value, [.. spec.GetProperty("values").EnumerateArray().Select(v => v.GetString()!)], path, what, errors);
                break;
            case "strings":
                ValidateStrings(spec, value, path, what, errors);
                break;
            case "items":
                ValidateItems(spec, value, path, what, errors);
                break;
        }
    }

    private static void ValidateStrings(JsonElement spec, JsonElement value, string path, string what, List<ThemeValidationError> errors)
    {
        if (value.ValueKind != JsonValueKind.Array)
        {
            errors.Add(new(path, $"{what} no es una lista."));
            return;
        }
        var max = spec.GetProperty("max").GetInt32();
        if (value.GetArrayLength() > max)
            errors.Add(new(path, $"{what}: hay {value.GetArrayLength()} y el máximo es {max}."));
        var media = spec.GetProperty("of").GetString() == "media";
        var i = 0;
        foreach (var item in value.EnumerateArray())
        {
            var itemPath = $"{path}[{i}]";
            if (CheckString(item, media ? ThemeContract.Limit("url") : MaxIdLength, itemPath, $"{what} ({i + 1})", errors)
                && media && !IsSafe(item.GetString()!, MediaSchemes))
                errors.Add(new(itemPath, $"{what} ({i + 1}) no es una dirección de imagen válida."));
            i++;
        }
    }

    private static void ValidateItems(JsonElement spec, JsonElement value, string path, string what, List<ThemeValidationError> errors)
    {
        if (value.ValueKind != JsonValueKind.Array)
        {
            errors.Add(new(path, $"{what} no es una lista."));
            return;
        }
        var max = spec.GetProperty("max").GetInt32();
        if (value.GetArrayLength() > max)
            errors.Add(new(path, $"{what}: hay {value.GetArrayLength()} y el máximo es {max}."));
        var i = 0;
        foreach (var item in value.EnumerateArray())
        {
            var itemPath = $"{path}[{i}]";
            var itemWhat = $"{what}, el {i + 1}";
            if (item.ValueKind != JsonValueKind.Object)
                errors.Add(new(itemPath, $"{itemWhat} no es válido (tiene que ser un objeto)."));
            else
            {
                if (item.TryGetProperty("label", out var label) && label.ValueKind is not JsonValueKind.Null)
                    CheckString(label, ThemeContract.Limit("label"), $"{itemPath}.label", $"{itemWhat}: el nombre", errors);
                ValidateFields(spec.GetProperty("fields"), item, itemPath, itemWhat, errors);
            }
            i++;
        }
    }

    /// <summary>Texto con largo máximo. Devuelve si es un texto (para seguir validando su contenido).</summary>
    private static bool CheckString(JsonElement value, int max, string path, string what, List<ThemeValidationError> errors)
    {
        if (value.ValueKind != JsonValueKind.String)
        {
            errors.Add(new(path, $"{what} tiene que ser un texto."));
            return false;
        }
        var length = value.GetString()!.Length;
        if (length <= max) return true;
        errors.Add(new(path, $"{what} tiene {length} caracteres y el máximo es {max}."));
        return false;
    }

    private static void CheckEnum(JsonElement value, IReadOnlyList<string> allowed, string path, string what, List<ThemeValidationError> errors)
    {
        if (value.ValueKind == JsonValueKind.String && allowed.Contains(value.GetString()!)) return;
        errors.Add(new(path, $"{what} no es una opción válida."));
    }

    private static string FieldName(string key) => FieldNames.TryGetValue(key, out var name) ? name : $"«{key}»";

    /// <summary>
    /// Sin esquema (ruta relativa, #ancla) o con uno permitido. Antes de mirar el
    /// esquema se sacan espacios y caracteres de control: el navegador ignora un
    /// tab o un salto de línea en medio de "java\nscript:".
    /// </summary>
    public static bool IsSafeLink(string value) => IsSafe(value, LinkSchemes);

    private static bool IsSafe(string value, HashSet<string> schemes)
    {
        var m = SchemeRegex().Match(InvisibleRegex().Replace(value, string.Empty));
        return !m.Success || schemes.Contains(m.Groups[1].Value.ToLowerInvariant());
    }

    private static bool IsRgb(string value)
    {
        var m = RgbRegex().Match(value.Trim());
        return m.Success && Enumerable.Range(1, 3).All(i => int.Parse(m.Groups[i].Value) <= 255);
    }

    [GeneratedRegex(@"^([a-zA-Z][a-zA-Z0-9+.\-]*):")]
    private static partial Regex SchemeRegex();

    [GeneratedRegex(@"[\u0000- \u007f-\u009f]")]
    private static partial Regex InvisibleRegex();

    [GeneratedRegex(@"^(\d{1,3}) (\d{1,3}) (\d{1,3})$")]
    private static partial Regex RgbRegex();
}
