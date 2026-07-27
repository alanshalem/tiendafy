namespace Fiscal.Core.Domain;

/// <summary>Una línea de la composición de IVA (para el array Iva de WSFEv1).</summary>
public sealed record IvaLine(IvaId Id, decimal BaseImp, decimal Importe);

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
    IReadOnlyList<IvaLine> Iva);
