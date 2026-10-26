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
    public static ScannedInvoice ToScanned(InvoiceExtraction e) => new(
        SupplierName: e.SupplierName,
        SupplierTaxId: DigitsOrNull(e.SupplierTaxId),
        InvoiceType: e.InvoiceType?.Trim().ToUpperInvariant(),
        InvoiceNumber: e.InvoiceNumber?.Trim(),
        InvoiceDate: ParseDate(e.InvoiceDate),
        Currency: e.Currency?.Trim().ToUpperInvariant() is { Length: > 0 } currency ? currency : "ARS",
        NetAmount: e.NetAmount,
        VatAmount: e.VatAmount,
        OtherAmount: e.OtherAmount,
        TotalAmount: e.TotalAmount,
        Lines: [.. (e.Lines ?? [])
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
            .Take(10)]);

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

    private static DateTime? ParseDate(string? value) =>
        DateTime.TryParse(value, CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var date)
            ? date
            : null;

    private static string? DigitsOrNull(string? value)
    {
        var digits = new string((value ?? string.Empty).Where(char.IsAsciiDigit).ToArray());
        return digits.Length == 11 ? digits : null;
    }
}
