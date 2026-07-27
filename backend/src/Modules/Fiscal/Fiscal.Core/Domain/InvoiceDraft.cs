namespace Fiscal.Core.Domain;

/// <summary>Una línea de la composición de IVA (para el array Iva de WSFEv1).</summary>
public sealed record IvaLine(IvaId Id, decimal BaseImp, decimal Importe);

/// <summary>
/// Comprobante asociado (CbtesAsoc): referencia al comprobante original que una
/// nota de crédito rectifica. Obligatorio en NC.
/// </summary>
public sealed record CbteAsoc(CbteTipo Tipo, int PtoVta, long Nro, DateOnly? Fecha = null);

/// <summary>
/// Datos del receptor ya resueltos (tipo/número de doc + condición IVA). Lo
/// arma ReceptorResolver aplicando el umbral de consumidor final.
/// </summary>
public sealed record Receptor(DocTipo DocTipo, long DocNro, CondicionIvaReceptor Condicion);

/// <summary>
/// Comprobante listo para autorizar en WSFEv1 (montos en pesos, no centavos).
/// Es el resultado del armado por clase; el adapter lo serializa al SOAP de ARCA.
/// La ecuación de control (H10): ImpTotal = ImpTotConc + ImpOpEx + ImpNeto +
/// ImpIVA + ImpTrib.
/// </summary>
public sealed record InvoiceDraft(
    CbteTipo CbteTipo,
    Concepto Concepto,
    Receptor Receptor,
    string Currency,        // "PES" para pesos (código ARCA)
    decimal ImpTotal,
    decimal ImpTotConc,     // neto no gravado
    decimal ImpNeto,        // neto gravado (A/B) o subtotal (C)
    decimal ImpOpEx,        // exento
    decimal ImpIVA,
    decimal ImpTrib,
    IReadOnlyList<IvaLine> Iva)
{
    /// <summary>Comprobantes asociados (vacío salvo en notas de crédito). Se
    /// adjunta con <c>draft with { CbtesAsoc = [...] }</c> en la emisión de NC.</summary>
    public IReadOnlyList<CbteAsoc> CbtesAsoc { get; init; } = [];
}
