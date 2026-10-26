namespace Api.Purchasing;

/// <summary>
/// Lo que se le pide al modelo al leer una factura (camelCase en el cable; el esquema JSON sale de este
/// tipo). La fecha va como texto AAAA-MM-DD. Todo es opcional: lo que no se lee viene en null.
/// </summary>
public sealed record InvoiceExtraction(
    string? SupplierName,
    string? SupplierTaxId,
    string? InvoiceType,
    string? InvoiceNumber,
    string? InvoiceDate,
    string? Currency,
    decimal? NetAmount,
    decimal? VatAmount,
    decimal? OtherAmount,
    decimal? TotalAmount,
    IReadOnlyList<InvoiceExtractionLine>? Lines,
    string? Confidence,
    IReadOnlyList<string>? Warnings);

public sealed record InvoiceExtractionLine(string? Description, string? Code, decimal? Quantity, decimal? UnitPrice);

public sealed record ScannedInvoiceLine(string Description, string? Code, decimal? Quantity, decimal? UnitPrice);

/// <summary>
/// La factura leída y normalizada. <paramref name="OtherAmount"/> es lo que no es neto ni IVA pero suma al
/// total: no gravado, exento, percepciones, impuestos internos.
/// </summary>
public sealed record ScannedInvoice(
    string? SupplierName,
    string? SupplierTaxId,
    string? InvoiceType,
    string? InvoiceNumber,
    DateTime? InvoiceDate,
    string Currency,
    decimal? NetAmount,
    decimal? VatAmount,
    decimal? OtherAmount,
    decimal? TotalAmount,
    IReadOnlyList<ScannedInvoiceLine> Lines,
    string Confidence,
    IReadOnlyList<string> Warnings)
{
    /// <summary>
    /// Lo que el modelo leyó y no se pudo normalizar (un CUIT de largo raro, una fecha que no es AAAA-MM-DD):
    /// el dato queda en null y esto lo vuelve un control visible, que el validador suma a los suyos.
    /// </summary>
    public IReadOnlyList<InvoiceIssue> ParseIssues { get; init; } = [];
}
