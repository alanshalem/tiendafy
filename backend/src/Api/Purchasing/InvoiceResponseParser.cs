using System.Globalization;
using System.Text.Json;
using SharedKernel.Common;

namespace Api.Purchasing;

/// <summary>
/// El JSON que devuelve el modelo al leer una factura. Es la frontera con algo que no controlamos: primero
/// el camino estricto (el modelo respetó el esquema) y, si falla, el tolerante (bloque de código, números
/// como texto, campos de más). Nada de eso puede terminar en una excepción ni en un importe inventado.
/// </summary>
public static class InvoiceResponseParser
{
    public static ScannedInvoice? Parse(string raw)
    {
        var text = raw.Trim();

        try
        {
            if (JsonSerializer.Deserialize<InvoiceExtraction>(text, JsonSerializerOptions.Web) is { } strict)
                return ToScanned(strict);
        }
        catch (JsonException)
        {
            // El camino tolerante de abajo.
        }

        return ParseTolerant(text);
    }

    /// <summary>Normaliza lo leído: CUIT a 11 dígitos o null, tipo en mayúsculas, moneda o "ARS", confianza o "baja".</summary>
    public static ScannedInvoice ToScanned(InvoiceExtraction e)
    {
        var issues = new List<InvoiceIssue>();
        return Build(e, ReadTaxId(e.SupplierTaxId, issues), ReadDate(e.InvoiceDate, issues), issues);
    }

    private static ScannedInvoice Build(
        InvoiceExtraction e, string? taxId, DateTime? date, List<InvoiceIssue> issues) => new(
        SupplierName: e.SupplierName,
        SupplierTaxId: taxId,
        InvoiceType: e.InvoiceType?.Trim().ToUpperInvariant(),
        InvoiceNumber: e.InvoiceNumber?.Trim(),
        InvoiceDate: date,
        Currency: e.Currency?.Trim().ToUpperInvariant() is { Length: > 0 } currency ? currency : "ARS",
        NetAmount: e.NetAmount,
        VatAmount: e.VatAmount,
        OtherAmount: e.OtherAmount,
        TotalAmount: e.TotalAmount,
        Lines: [.. (e.Lines ?? [])
            .Where(l => l is not null)
            .Select(l => new ScannedInvoiceLine(
                l.Description?.Trim() ?? "",
                string.IsNullOrWhiteSpace(l.Code) ? null : l.Code.Trim(),
                l.Quantity,
                l.UnitPrice))
            .Where(l => l.Description.Length > 0)
            .Take(200)],
        Confidence: e.Confidence?.Trim().ToLowerInvariant() is { Length: > 0 } confidence ? confidence : "baja",
        Warnings: [.. (e.Warnings ?? [])
            .Select(w => w?.Trim() ?? "")
            .Where(w => w.Length > 0)
            .Take(10)])
        {
            ParseIssues = issues,
        };

    /// <summary>
    /// Tolera que el JSON venga envuelto en un bloque de código: pasa, y hacer fallar toda la lectura por
    /// tres backticks sería absurdo.
    /// </summary>
    private static ScannedInvoice? ParseTolerant(string text)
    {
        if (text.StartsWith("```", StringComparison.Ordinal))
        {
            var start = text.IndexOf('\n');
            var end = text.LastIndexOf("```", StringComparison.Ordinal);
            if (start < 0 || end <= start) return null;
            text = text[(start + 1)..end].Trim();
        }

        try
        {
            using var doc = JsonDocument.Parse(text);
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return null;

            return ToScanned(new InvoiceExtraction(
                SupplierName: JsonRead.GetString(root, "supplierName"),
                SupplierTaxId: JsonRead.GetString(root, "supplierTaxId"),
                InvoiceType: JsonRead.GetString(root, "invoiceType"),
                InvoiceNumber: JsonRead.GetString(root, "invoiceNumber"),
                InvoiceDate: JsonRead.GetString(root, "invoiceDate"),
                Currency: JsonRead.GetString(root, "currency"),
                NetAmount: GetDecimal(root, "netAmount"),
                VatAmount: GetDecimal(root, "vatAmount"),
                OtherAmount: GetDecimal(root, "otherAmount"),
                TotalAmount: GetDecimal(root, "totalAmount"),
                Lines: ReadLines(root),
                Confidence: JsonRead.GetString(root, "confidence"),
                Warnings: ReadStrings(root, "warnings")));
        }
        catch (JsonException)
        {
            return null;
        }
    }

    /// <summary>El texto sin el bloque de código que lo envuelve; null si el bloque está mal cerrado.</summary>
    internal static string? Unfence(string text)
    {
        text = text.Trim();
        if (!text.StartsWith("```", StringComparison.Ordinal)) return text;

        var start = text.IndexOf('\n');
        var end = text.LastIndexOf("```", StringComparison.Ordinal);
        return start < 0 || end <= start ? null : text[(start + 1)..end].Trim();
    }

    private static List<InvoiceExtractionLine> ReadLines(JsonElement root)
    {
        if (!root.TryGetProperty("lines", out var lines) || lines.ValueKind != JsonValueKind.Array) return [];

        return [.. lines.EnumerateArray()
            .Where(l => l.ValueKind == JsonValueKind.Object)
            .Select(l => new InvoiceExtractionLine(
                JsonRead.GetString(l, "description"),
                JsonRead.GetString(l, "code"),
                GetDecimal(l, "quantity"),
                GetDecimal(l, "unitPrice")))];
    }

    private static List<string> ReadStrings(JsonElement root, string property)
    {
        if (!root.TryGetProperty(property, out var array) || array.ValueKind != JsonValueKind.Array) return [];

        return [.. array.EnumerateArray()
            .Where(e => e.ValueKind == JsonValueKind.String)
            .Select(e => e.GetString()!)];
    }

    /// <summary>
    /// El modelo puede mandar el número como número o como texto ("12345.67"): las dos formas se
    /// aceptan, cualquier otra cosa es null.
    /// </summary>
    private static decimal? GetDecimal(JsonElement element, string property)
    {
        if (!element.TryGetProperty(property, out var value)) return null;
        return value.ValueKind switch
        {
            JsonValueKind.Number when value.TryGetDecimal(out var n) => n,
            JsonValueKind.String when decimal.TryParse(
                value.GetString(), NumberStyles.Any, CultureInfo.InvariantCulture, out var s) => s,
            _ => null,
        };
    }

    /// <summary>Solo AAAA-MM-DD, que es lo que se le pide al modelo: "05/10/2026" es ambiguo y se descarta con un control.</summary>
    private static DateTime? ReadDate(string? value, List<InvoiceIssue> issues)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;

        if (DateTime.TryParseExact(value.Trim(), "yyyy-MM-dd", CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var date))
            return date;

        var shown = Text.Clip(value.Trim(), 20);
        issues.Add(new InvoiceIssue(
            "Invoice.DateFormat",
            $"La fecha leída ({shown}) no se pudo interpretar como fecha: revisala.",
            $"invoiceDate \"{shown}\" no está en formato AAAA-MM-DD."));
        return null;
    }

    /// <summary>11 dígitos o null. Un CUIT con otro largo es un error de lectura: queda un control en vez de desaparecer.</summary>
    private static string? ReadTaxId(string? value, List<InvoiceIssue> issues)
    {
        var digits = new string((value ?? string.Empty).Where(char.IsAsciiDigit).ToArray());
        if (digits.Length == 11) return digits;
        if (digits.Length == 0) return null;

        issues.Add(new InvoiceIssue(
            "Invoice.CuitLength",
            $"CUIT con largo inválido: se leyó {Text.Clip(digits, 20)} ({digits.Length} dígitos) y tiene que tener 11.",
            $"supplierTaxId se leyó con {digits.Length} dígitos y un CUIT tiene 11."));
        return null;
    }
}
