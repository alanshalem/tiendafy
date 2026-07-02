using System.Globalization;
using System.Text;
using Catalog.Core.Domain;

namespace Api.Import;

public sealed class ImportOption
{
    public required string Name { get; init; }
    public List<string> Values { get; } = [];
}

public sealed class ImportVariant
{
    public string Sku { get; set; } = "";
    public List<string> OptionValues { get; } = [];
    public long PriceMinor { get; set; }
    public long? CompareAtMinor { get; set; }
    public int? Stock { get; set; }
    public int Line { get; set; }
}

public sealed class ImportProduct
{
    public string Handle { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public string Categories { get; set; } = "";
    public string? Brand { get; set; }
    public string? SeoTitle { get; set; }
    public string? SeoDescription { get; set; }
    public bool Visible { get; set; } = true;
    public List<ImportOption> Options { get; } = [];
    public List<ImportVariant> Variants { get; } = [];
    public List<string> ImageUrls { get; } = [];
    public int Line { get; set; }
}

/// <summary>
/// Parser + mapper + exportador del CSV de productos estilo Tiendanube.
/// Agrupa filas por "Identificador de URL": la primera fila del grupo define
/// el producto; cada fila aporta una variante; las imágenes se acumulan.
/// </summary>
public static class ProductCsv
{
    public const string Currency = "ARS";

    /// <summary>Cabecera canónica. El orden manda para la plantilla y el export.</summary>
    public static readonly string[] Headers =
    [
        "Identificador de URL",
        "Nombre",
        "Categorías",
        "Nombre de propiedad 1",
        "Valor de propiedad 1",
        "Nombre de propiedad 2",
        "Valor de propiedad 2",
        "Precio",
        "Precio promocional",
        "Peso (kg)",
        "Alto (cm)",
        "Ancho (cm)",
        "Profundidad (cm)",
        "Stock",
        "SKU",
        "Código de barras",
        "Mostrar en tienda",
        "Envío sin cargo",
        "Descripción",
        "Imágenes",
        "Tags",
        "Título para SEO",
        "Descripción para SEO",
    ];

    // ---------------------------------------------------------------- Parsing

    /// <summary>
    /// Parser RFC 4180: soporta comillas, "" escapadas, separadores y saltos de
    /// línea dentro de celdas. Autodetecta ';' (Excel es-AR) o ','.
    /// </summary>
    public static (List<string> Headers, List<List<string>> Rows) Parse(string text)
    {
        text = text.TrimStart('﻿');

        var nl = text.IndexOfAny(['\r', '\n']);
        var firstLine = nl < 0 ? text : text[..nl];
        var sep = firstLine.Contains(';') ? ';' : ',';

        var rows = new List<List<string>>();
        var row = new List<string>();
        var field = new StringBuilder();
        var inQuotes = false;

        for (var i = 0; i < text.Length; i++)
        {
            var c = text[i];
            if (inQuotes)
            {
                if (c == '"')
                {
                    if (i + 1 < text.Length && text[i + 1] == '"') { field.Append('"'); i++; }
                    else inQuotes = false;
                }
                else field.Append(c);
            }
            else if (c == '"') inQuotes = true;
            else if (c == sep) { row.Add(field.ToString()); field.Clear(); }
            else if (c == '\r') { /* el corte real lo hace \n */ }
            else if (c == '\n') { row.Add(field.ToString()); field.Clear(); rows.Add(row); row = []; }
            else field.Append(c);
        }
        if (field.Length > 0 || row.Count > 0) { row.Add(field.ToString()); rows.Add(row); }

        var headers = rows.Count > 0 ? rows[0].Select(h => h.Trim()).ToList() : [];
        var dataRows = rows.Skip(1).Where(r => r.Any(c => c.Trim().Length > 0)).ToList();
        return (headers, dataRows);
    }

    // -------------------------------------------------------------- Mapping

    public static List<ImportProduct> MapProducts(string csv)
    {
        var (headers, rows) = Parse(csv);
        var index = BuildHeaderIndex(headers);

        // Agrupar por handle preservando el orden de aparición.
        var groups = new List<(string Key, List<(List<string> Cells, int Line)> Rows)>();
        var byKey = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

        for (var r = 0; r < rows.Count; r++)
        {
            var cells = rows[r];
            var line = r + 2; // +1 cabecera, +1 base-1
            var handle = Cell(cells, index, "identificador de url");
            var name = Cell(cells, index, "nombre");
            var key = !string.IsNullOrWhiteSpace(handle) ? handle.Trim()
                : !string.IsNullOrWhiteSpace(name) ? name.Trim()
                : $"__row_{line}";

            if (!byKey.TryGetValue(key, out var gi))
            {
                gi = groups.Count;
                byKey[key] = gi;
                groups.Add((key, []));
            }
            groups[gi].Rows.Add((cells, line));
        }

        var products = new List<ImportProduct>();
        foreach (var (_, groupRows) in groups)
        {
            var first = groupRows[0].Cells;
            var product = new ImportProduct
            {
                Handle = Cell(first, index, "identificador de url").Trim(),
                Name = Cell(first, index, "nombre").Trim(),
                Description = FirstNonEmpty(groupRows, index, "descripcion"),
                Categories = FirstNonEmpty(groupRows, index, "categorias") ?? "",
                Brand = FirstNonEmpty(groupRows, index, "marca"),
                SeoTitle = FirstNonEmpty(groupRows, index, "titulo para seo", "titulo seo"),
                SeoDescription = FirstNonEmpty(groupRows, index, "descripcion para seo", "descripcion seo"),
                Visible = ParseBool(Cell(first, index, "mostrar en tienda"), defaultValue: true),
                Line = groupRows[0].Line,
            };

            // Detectar opciones activas (hasta 2, como la plantilla).
            var optNames = new[]
            {
                Cell(first, index, "nombre de propiedad 1").Trim(),
                Cell(first, index, "nombre de propiedad 2").Trim(),
            };
            var slotValueKeys = new[] { "valor de propiedad 1", "valor de propiedad 2" };
            var activeSlots = new List<int>();
            for (var s = 0; s < optNames.Length; s++)
            {
                if (optNames[s].Length == 0) continue;
                var values = groupRows
                    .Select(gr => Cell(gr.Cells, index, slotValueKeys[s]).Trim())
                    .Where(v => v.Length > 0)
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();
                if (values.Count == 0) continue;
                activeSlots.Add(s);
                var opt = new ImportOption { Name = optNames[s] };
                opt.Values.AddRange(values);
                product.Options.Add(opt);
            }

            // Imágenes acumuladas de todas las filas del grupo.
            foreach (var gr in groupRows)
                foreach (var url in SplitImages(Cell(gr.Cells, index, "imagenes", "imagen", "fotos")))
                    if (!product.ImageUrls.Contains(url))
                        product.ImageUrls.Add(url);

            // Variantes: una por fila.
            foreach (var (cells, line) in groupRows)
            {
                var variant = new ImportVariant
                {
                    Sku = Cell(cells, index, "sku").Trim(),
                    PriceMinor = ParseMinor(Cell(cells, index, "precio")) ?? 0,
                    CompareAtMinor = ParseMinor(Cell(cells, index, "precio promocional")),
                    Stock = ParseInt(Cell(cells, index, "stock")),
                    Line = line,
                };
                foreach (var s in activeSlots)
                    variant.OptionValues.Add(Cell(cells, index, slotValueKeys[s]).Trim());
                product.Variants.Add(variant);
            }

            products.Add(product);
        }

        return products;
    }

    // -------------------------------------------------------------- Export

    public static string BuildExport(
        IEnumerable<Product> products,
        bool includeDescriptions,
        IReadOnlyDictionary<Guid, string> categoryPaths)
    {
        var sb = new StringBuilder();
        sb.Append('﻿');
        sb.AppendLine(string.Join(';', Headers.Select(Escape)));

        foreach (var p in products)
        {
            var images = string.Join(' ', p.Images.OrderBy(i => i.Position).Select(i => i.Url));
            var categories = string.Join(", ", p.CategoryIds
                .Select(id => categoryPaths.GetValueOrDefault(id))
                .Where(s => !string.IsNullOrEmpty(s)));
            var visible = p.Status == ProductStatus.Active ? "SI" : "NO";
            var opt1 = p.Options.Count > 0 ? p.Options[0].Name : "";
            var opt2 = p.Options.Count > 1 ? p.Options[1].Name : "";
            var description = includeDescriptions ? (p.Description ?? "").Replace('\n', ' ').Replace('\r', ' ') : "";

            var variants = p.Variants.Count > 0
                ? p.Variants.Cast<Variant?>().ToList()
                : new List<Variant?> { null };
            for (var vi = 0; vi < variants.Count; vi++)
            {
                var v = variants[vi];
                var firstRow = vi == 0;
                var cells = new[]
                {
                    p.Slug.Value,
                    p.Name,
                    firstRow ? categories : "",
                    opt1,
                    v != null && v.OptionValues.Count > 0 ? v.OptionValues[0] : "",
                    opt2,
                    v != null && v.OptionValues.Count > 1 ? v.OptionValues[1] : "",
                    // "Precio" = lista (el tachado si hay oferta); "Promocional" = lo cobrado.
                    v != null ? Minor((v.CompareAtPrice ?? v.Price).AmountInMinorUnits) : "",
                    v?.CompareAtPrice != null ? Minor(v.Price.AmountInMinorUnits) : "",
                    "", "", "", "", // Peso / Alto / Ancho / Prof
                    "", // Stock: vive en Inventory, no se exporta acá
                    v?.Sku ?? "",
                    "", // Código de barras
                    visible,
                    "NO", // Envío sin cargo
                    firstRow ? description : "",
                    firstRow ? images : "",
                    "", "", "", // Tags / SEO título / SEO desc
                };
                sb.AppendLine(string.Join(';', cells.Select(Escape)));
            }
        }

        return sb.ToString();
    }

    // -------------------------------------------------------------- Helpers

    private static Dictionary<string, int> BuildHeaderIndex(List<string> headers)
    {
        var map = new Dictionary<string, int>(StringComparer.Ordinal);
        for (var i = 0; i < headers.Count; i++)
        {
            var key = Normalize(headers[i]);
            map.TryAdd(key, i);
        }
        return map;
    }

    private static string Cell(List<string> cells, Dictionary<string, int> index, params string[] keys)
    {
        foreach (var key in keys)
        {
            // Match exacto normalizado, o por prefijo (ej "peso (kg)" ~ "peso").
            if (index.TryGetValue(key, out var i) && i < cells.Count)
                return cells[i];
            var hit = index.FirstOrDefault(kv => kv.Key.StartsWith(key, StringComparison.Ordinal));
            if (hit.Key != null && hit.Value < cells.Count)
                return cells[hit.Value];
        }
        return "";
    }

    private static string? FirstNonEmpty(
        List<(List<string> Cells, int Line)> rows, Dictionary<string, int> index, params string[] keys)
    {
        foreach (var (cells, _) in rows)
        {
            var v = Cell(cells, index, keys).Trim();
            if (v.Length > 0) return v;
        }
        return null;
    }

    private static IEnumerable<string> SplitImages(string raw) =>
        raw.Split([' ', ',', ';', '|', '\n', '\r', '\t'], StringSplitOptions.RemoveEmptyEntries)
            .Select(s => s.Trim())
            .Where(s => Uri.IsWellFormedUriString(s, UriKind.Absolute));

    private static long? ParseMinor(string raw)
    {
        raw = new string(raw.Where(c => char.IsDigit(c) || c is '.' or ',' or '-').ToArray());
        if (raw.Length == 0) return null;

        var hasDot = raw.Contains('.');
        var hasComma = raw.Contains(',');
        if (hasDot && hasComma)
            raw = raw.LastIndexOf(',') > raw.LastIndexOf('.')
                ? raw.Replace(".", "").Replace(',', '.')   // 1.234,56 → 1234.56
                : raw.Replace(",", "");                      // 1,234.56 → 1234.56
        else if (hasComma)
            raw = raw.Replace(',', '.');

        return decimal.TryParse(raw, NumberStyles.Number, CultureInfo.InvariantCulture, out var d)
            ? (long)Math.Round(d * 100m, MidpointRounding.AwayFromZero)
            : null;
    }

    private static int? ParseInt(string raw)
    {
        var digits = new string(raw.Where(char.IsDigit).ToArray());
        return digits.Length > 0 && int.TryParse(digits, out var n) ? n : null;
    }

    private static bool ParseBool(string raw, bool defaultValue)
    {
        var v = Normalize(raw);
        if (v.Length == 0) return defaultValue;
        if (v is "no" or "false" or "0" or "n") return false;
        if (v is "si" or "yes" or "true" or "1" or "s") return true;
        return defaultValue;
    }

    private static string Minor(long minor) =>
        (minor / 100m).ToString("0.##", CultureInfo.InvariantCulture);

    private static string Escape(string c) => $"\"{c.Replace("\"", "\"\"")}\"";

    /// <summary>Lower + sin acentos + espacios colapsados, para matchear cabeceras.</summary>
    private static string Normalize(string s)
    {
        var lowered = s.Trim().ToLowerInvariant();
        var decomposed = lowered.Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(decomposed.Length);
        foreach (var c in decomposed)
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
                sb.Append(c);
        var noAccents = sb.ToString().Normalize(NormalizationForm.FormC);
        return string.Join(' ', noAccents.Split(' ', StringSplitOptions.RemoveEmptyEntries));
    }
}
