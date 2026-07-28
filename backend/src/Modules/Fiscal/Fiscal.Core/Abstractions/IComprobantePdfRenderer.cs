namespace Fiscal.Core.Abstractions;

/// <summary>Línea del comprobante para el PDF (descripción + cantidad + total).</summary>
public sealed record ComprobantePdfItem(string Description, int Quantity, decimal LineTotal);

/// <summary>
/// Datos ya resueltos para renderizar el PDF del comprobante. El ensamblado (unir
/// FiscalDocument + orden + config) vive en el host; el renderer sólo dibuja y
/// arma el QR de ARCA. No lleva secretos.
/// </summary>
public sealed record ComprobantePdfData(
    // Emisor
    long EmisorCuit,
    string EmisorName,
    string EmisorConditionLabel,
    // Comprobante
    string Letra,            // A / B / C
    int TipoCmp,             // código ARCA (1,6,11,3,8,13)
    string TipoLabel,        // "Factura B", "Nota de Crédito C", ...
    int PtoVta,
    long Number,
    DateOnly Fecha,
    string Cae,
    DateOnly? CaeVto,
    // Receptor
    int TipoDocRec,
    long NroDocRec,
    string ReceptorDocLabel, // "CUIT 30-...", "Consumidor Final"
    string ReceptorConditionLabel,
    // Montos
    decimal ImpNeto,
    decimal ImpIVA,
    decimal ImpTotal,
    string Currency,         // "PES"
    IReadOnlyList<ComprobantePdfItem> Items);

/// <summary>Renderiza el PDF del comprobante (con el QR de ARCA embebido).</summary>
public interface IComprobantePdfRenderer
{
    byte[] Render(ComprobantePdfData data);
}
