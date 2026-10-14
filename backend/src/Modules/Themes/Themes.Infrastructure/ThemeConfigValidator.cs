using System.Globalization;
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
        ["endsAt"] = "la fecha en que termina",
        ["whenEnded"] = "qué pasa cuando termina",
        ["endedText"] = "el mensaje cuando termina",
        ["productId"] = "el producto",
        ["categoryId"] = "la categoría",
        ["badge"] = "la etiqueta",
        ["mobileImage"] = "la imagen para celular",
        ["couponCode"] = "el cupón",
        ["trigger"] = "cuándo aparece",
        ["delaySeconds"] = "los segundos de espera",
        ["frequency"] = "cada cuánto aparece",
        ["frequencyDays"] = "los días entre apariciones",
        ["body"] = "el texto",
        ["count"] = "la cantidad",
        ["columnsDesktop"] = "las columnas en computadora",
        ["columnsMobile"] = "las columnas en celular",
        ["blocks"] = "los bloques",
        ["url"] = "el link del video",
        ["file"] = "el video",
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

        if (config.TryGetProperty("footer", out var footer) && footer.ValueKind == JsonValueKind.Object)
            ValidateFooter(footer, errors);

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
        ValidatePerPageLimits(sections, errors);
        return errors;
    }

    /// <summary>
    /// Tipos que van uno solo por página: el pop-up, el newsletter y el hero con
    /// video. El editor no deja agregar el segundo, pero un tema que llegaba por
    /// la API sí lo guardaba: dos pop-ups se tapaban entre sí y dos newsletters
    /// pedían el mail dos veces. Cuentan también las ocultas, como en el editor
    /// (mostrar una oculta no puede dejar la página en un estado que no se
    /// guarda). Se marca cada una de más, no la primera.
    /// </summary>
    private static void ValidatePerPageLimits(JsonElement sections, List<ThemeValidationError> errors)
    {
        var count = new Dictionary<string, int>(StringComparer.Ordinal);
        var index = 0;
        foreach (var s in sections.EnumerateArray())
        {
            if (s.ValueKind == JsonValueKind.Object
                && s.TryGetProperty("type", out var t) && t.ValueKind == JsonValueKind.String
                && ThemeContract.TryGetSection(t.GetString()!, out var def)
                && def.TryGetProperty("maxPerPage", out var maxEl) && maxEl.TryGetInt32(out var max))
            {
                var type = t.GetString()!;
                var seen = count[type] = count.GetValueOrDefault(type) + 1;
                if (seen > max)
                {
                    var label = def.GetProperty("label").GetString();
                    errors.Add(new($"sections[{index}].type", max == 1
                        ? $"La sección {index + 1} es otra «{label}» y puede haber una sola en la página de inicio: borrá una."
                        : $"La sección {index + 1} es otra «{label}» y puede haber hasta {max} en la página de inicio."));
                }
            }
            index++;
        }
    }

    /// <summary>Redes del pie: links que se dibujan tal cual en la tienda.</summary>
    private static readonly (string Key, string Name)[] FooterSocials =
        [("instagram", "Instagram"), ("facebook", "Facebook"), ("tiktok", "TikTok"), ("youtube", "YouTube"), ("x", "X")];

    /// <summary>
    /// El pie: sus columnas (tipos, topes, los que van una sola vez) y todos sus
    /// links. Antes no se miraba nada: un "javascript:" pegado en un link del
    /// pie o en una red llegaba guardado, y solo lo frenaba la tienda al dibujar.
    /// Las reglas salen de <see cref="ThemeContract"/> (las mismas del editor).
    /// Un link vacío pasa: es el que el comercio acaba de agregar y está por
    /// elegir.
    /// </summary>
    private static void ValidateFooter(JsonElement footer, List<ThemeValidationError> errors)
    {
        foreach (var (key, name) in FooterSocials)
            if (footer.TryGetProperty(key, out var social) && social.ValueKind is not JsonValueKind.Null
                && CheckString(social, ThemeContract.Limit("url"), $"footer.{key}", $"El pie: el link de {name}", errors)
                && !IsSafe(social.GetString()!, LinkSchemes))
                errors.Add(new($"footer.{key}", $"El pie: el link de {name} no es válido (usá la dirección de tu perfil)."));

        if (footer.TryGetProperty("links", out var links) && links.ValueKind is not JsonValueKind.Null)
            ValidateFooterLinks(links, int.MaxValue, "footer.links", "El pie", errors);

        if (!footer.TryGetProperty("columns", out var columns) || columns.ValueKind == JsonValueKind.Null) return;
        if (columns.ValueKind != JsonValueKind.Array)
        {
            errors.Add(new("footer.columns", "Las columnas del pie no son una lista."));
            return;
        }

        var rules = ThemeContract.Root.GetProperty("footer");
        var max = rules.GetProperty("maxColumns").GetInt32();
        if (columns.GetArrayLength() > max)
            errors.Add(new("footer.columns", $"El pie tiene {columns.GetArrayLength()} columnas y el máximo es {max}."));
        var kinds = rules.GetProperty("kinds").EnumerateArray().Select(k => k.GetString()!).ToList();
        var single = rules.GetProperty("singleKinds").EnumerateArray().Select(k => k.GetString()!).ToHashSet();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var ids = new HashSet<string>(StringComparer.Ordinal);
        var index = 0;
        foreach (var column in columns.EnumerateArray())
        {
            var path = $"footer.columns[{index}]";
            var where = $"La columna {index + 1} del pie";
            index++;
            if (column.ValueKind != JsonValueKind.Object)
            {
                errors.Add(new(path, $"{where} no es válida (tiene que ser un objeto)."));
                continue;
            }
            if (!column.TryGetProperty("id", out var id) || id.ValueKind != JsonValueKind.String
                || string.IsNullOrWhiteSpace(id.GetString()) || id.GetString()!.Length > MaxIdLength)
                errors.Add(new($"{path}.id", $"{where} no tiene un identificador válido."));
            else if (!ids.Add(id.GetString()!))
                errors.Add(new($"{path}.id", $"{where} repite el identificador de otra columna."));

            var kind = column.TryGetProperty("kind", out var k) && k.ValueKind == JsonValueKind.String ? k.GetString()! : null;
            if (kind is null || !kinds.Contains(kind))
            {
                errors.Add(new($"{path}.kind", $"{where} es de un tipo que no existe."));
                continue;
            }
            if (!seen.Add(kind) && single.Contains(kind))
                errors.Add(new($"{path}.kind", $"{where} repite un tipo que va una sola vez («{kind}»): borrá una."));

            if (column.TryGetProperty("title", out var title) && title.ValueKind is not JsonValueKind.Null)
                CheckString(title, rules.GetProperty("title").GetInt32(), $"{path}.title", $"{where}: el título", errors);
            if (column.TryGetProperty("text", out var text) && text.ValueKind is not JsonValueKind.Null)
                CheckString(text, rules.GetProperty("text").GetInt32(), $"{path}.text", $"{where}: el texto", errors);
            if (column.TryGetProperty("links", out var columnLinks) && columnLinks.ValueKind is not JsonValueKind.Null)
                ValidateFooterLinks(columnLinks, rules.GetProperty("maxLinks").GetInt32(), $"{path}.links", where, errors);
        }
    }

    private static void ValidateFooterLinks(JsonElement links, int max, string path, string where, List<ThemeValidationError> errors)
    {
        if (links.ValueKind != JsonValueKind.Array)
        {
            errors.Add(new(path, $"{where}: los links no son una lista."));
            return;
        }
        if (links.GetArrayLength() > max)
            errors.Add(new(path, $"{where} tiene {links.GetArrayLength()} links y el máximo es {max}."));
        var i = 0;
        foreach (var link in links.EnumerateArray())
        {
            var itemPath = $"{path}[{i}]";
            var what = $"{where}: el link {i + 1}";
            i++;
            if (link.ValueKind != JsonValueKind.Object)
            {
                errors.Add(new(itemPath, $"{what} no es válido (tiene que ser un objeto)."));
                continue;
            }
            if (link.TryGetProperty("label", out var label) && label.ValueKind is not JsonValueKind.Null)
                CheckString(label, ThemeContract.Limit("label"), $"{itemPath}.label", $"{what}: el texto", errors);
            if (link.TryGetProperty("href", out var href) && href.ValueKind is not JsonValueKind.Null
                && CheckString(href, ThemeContract.Limit("url"), $"{itemPath}.href", what, errors)
                && !IsSafe(href.GetString()!, LinkSchemes))
                errors.Add(new($"{itemPath}.href", $"{what} no es un link válido (usá una dirección web, una ruta de la tienda, mailto: o tel:)."));
        }
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
            case "number":
                ValidateNumber(spec, value, path, what, errors);
                break;
            case "datetime":
                if (CheckString(value, MaxDateTimeLength, path, what, errors) && !IsDateTime(value.GetString()!))
                    errors.Add(new(path, $"{what} no es una fecha y hora válida."));
                break;
            case "richtext":
                ValidateRichText(spec, value, path, what, errors);
                break;
        }
    }

    private const int MaxDateTimeLength = 40;

    private static void ValidateNumber(JsonElement spec, JsonElement value, string path, string what, List<ThemeValidationError> errors)
    {
        var min = spec.GetProperty("min").GetInt32();
        var max = spec.GetProperty("max").GetInt32();
        if (value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var n)
            && n == Math.Floor(n) && n >= min && n <= max)
            return;
        errors.Add(new(path, $"{what} tiene que ser un número entero entre {min} y {max}."));
    }

    /// <summary>
    /// Vacío (sin fecha) o ISO 8601 completo, con zona: lo que guarda el editor
    /// (siempre en UTC). Una fecha sin zona se leería distinto según el servidor.
    /// </summary>
    private static bool IsDateTime(string value) =>
        value.Length == 0
        || (IsoDateTimeRegex().IsMatch(value)
            && DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.None, out _));

    /// <summary>Nodos del texto con formato que se aceptan (ver rich-text.ts en shared/types).</summary>
    private static readonly HashSet<string> RichBlocks = ["paragraph", "heading", "bulletList", "orderedList", "blockquote"];
    private static readonly HashSet<string> RichInlines = ["text", "hardBreak"];
    private static readonly HashSet<string> RichMarks = ["bold", "italic", "link"];
    private const int RichMaxDepth = 6;

    /// <summary>
    /// Texto con formato: un árbol con una lista cerrada de nodos y marcas, con
    /// tope de tamaño. La tienda lo dibuja con esa misma lista (nunca como
    /// HTML), pero guardar algo de más igual se rechaza: el editor no tiene por
    /// qué mandar un nodo que no conoce, y un link "javascript:" no se guarda.
    /// </summary>
    private static void ValidateRichText(JsonElement spec, JsonElement value, string path, string what, List<ThemeValidationError> errors)
    {
        if (RichType(value) != "doc")
        {
            errors.Add(new(path, $"{what} no es un texto con formato válido."));
            return;
        }
        var max = spec.GetProperty("max").GetInt32();
        var length = value.GetRawText().Length;
        if (length > max)
        {
            errors.Add(new(path, $"{what} es demasiado largo ({length} caracteres con su formato y el máximo es {max})."));
            return;
        }
        if (Content(value) is { } content && RichBlocksProblem(content, 1) is { } problem)
            errors.Add(new(path, $"{what} {problem}"));
    }

    private static JsonElement? Content(JsonElement node) =>
        node.TryGetProperty("content", out var c) && c.ValueKind is not JsonValueKind.Null ? c : null;

    /// <summary>El primer problema de una lista de bloques, o null si está bien.</summary>
    private static string? RichBlocksProblem(JsonElement blocks, int depth)
    {
        if (blocks.ValueKind != JsonValueKind.Array) return "no es un texto con formato válido.";
        if (depth > RichMaxDepth) return $"tiene más de {RichMaxDepth} niveles anidados.";
        foreach (var node in blocks.EnumerateArray())
        {
            var type = RichType(node);
            if (type is null || !RichBlocks.Contains(type))
                return $"tiene un elemento que no se puede guardar («{type ?? "?"}»).";
            var content = Content(node);
            var problem = type switch
            {
                "paragraph" => content is { } p ? RichInlineProblem(p) : null,
                "heading" => !IsHeadingLevel(node)
                    ? "tiene un título de un nivel que no existe."
                    : content is { } h ? RichInlineProblem(h) : null,
                "bulletList" or "orderedList" => content is { } items ? RichItemsProblem(items, depth) : "tiene una lista vacía.",
                _ => content is { } q ? RichBlocksProblem(q, depth + 1) : "tiene una cita vacía.",
            };
            if (problem is not null) return problem;
        }
        return null;
    }

    private static bool IsHeadingLevel(JsonElement node) =>
        node.TryGetProperty("attrs", out var attrs) && attrs.ValueKind == JsonValueKind.Object
        && attrs.TryGetProperty("level", out var level) && level.ValueKind == JsonValueKind.Number
        && level.TryGetInt32(out var l) && l is >= 2 and <= 4;

    private static string? RichItemsProblem(JsonElement items, int depth)
    {
        if (items.ValueKind != JsonValueKind.Array) return "tiene una lista que no es válida.";
        foreach (var item in items.EnumerateArray())
        {
            if (RichType(item) != "listItem") return "tiene una lista con un elemento que no es válido.";
            if (Content(item) is { } c && RichBlocksProblem(c, depth + 1) is { } problem) return problem;
        }
        return null;
    }

    private static string? RichInlineProblem(JsonElement inline)
    {
        if (inline.ValueKind != JsonValueKind.Array) return "tiene un párrafo que no es válido.";
        foreach (var node in inline.EnumerateArray())
        {
            var type = RichType(node);
            if (type is null || !RichInlines.Contains(type))
                return $"tiene un elemento que no se puede guardar («{type ?? "?"}»).";
            if (type == "hardBreak") continue;
            if (!node.TryGetProperty("text", out var text) || text.ValueKind != JsonValueKind.String)
                return "tiene un texto que no es válido.";
            if (!node.TryGetProperty("marks", out var marks) || marks.ValueKind == JsonValueKind.Null) continue;
            if (marks.ValueKind != JsonValueKind.Array) return "tiene un formato que no es válido.";
            foreach (var mark in marks.EnumerateArray())
            {
                var m = RichType(mark);
                if (m is null || !RichMarks.Contains(m)) return $"tiene un formato que no se puede guardar («{m ?? "?"}»).";
                if (m == "link" && !IsSafeRichLink(mark))
                    return "tiene un link que no es válido (usá una dirección web, una ruta de la tienda, mailto: o tel:).";
            }
        }
        return null;
    }

    private static bool IsSafeRichLink(JsonElement mark) =>
        mark.TryGetProperty("attrs", out var attrs) && attrs.ValueKind == JsonValueKind.Object
        && attrs.TryGetProperty("href", out var h) && h.ValueKind == JsonValueKind.String
        && h.GetString()!.Length <= ThemeContract.Limit("url") && IsSafe(h.GetString()!, LinkSchemes);

    private static string? RichType(JsonElement node) =>
        node.ValueKind == JsonValueKind.Object && node.TryGetProperty("type", out var t) && t.ValueKind == JsonValueKind.String
            ? t.GetString()
            : null;

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

    [GeneratedRegex(@"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,7})?)?(Z|[+-]\d{2}:\d{2})$")]
    private static partial Regex IsoDateTimeRegex();
}
