using Fiscal.Core.Domain;
using SharedKernel.Common;

namespace Fiscal.Core.Abstractions;

/// <summary>
/// Orden de emitir un comprobante. Para emisión manual desde el admin, OrderId
/// es null y el operador pasa el total y (opcional) el documento del comprador.
/// Para emisión automática, viene de la orden.
/// </summary>
public sealed record EmitInvoiceCommand(
    Guid TenantId,
    Guid? OrderId,
    long GrossMinorUnits,
    string? BuyerDoc = null,
    int? PtoVta = null,          // número de punto de venta; null = usa el default de la config
    bool CreditNote = false,
    // Condición frente al IVA del comprador cuando se la conoce (la eligió el
    // comercio o la devolvió el padrón). Null = se infiere del documento.
    CondicionIvaReceptor? BuyerIvaCondition = null);

/// <summary>Códigos de error de la emisión que quien la llama necesita distinguir.</summary>
public static class EmissionErrors
{
    /// <summary>
    /// Venta anónima por encima del umbral de consumidor final: falta el
    /// documento del comprador. Es un dato de la venta; reintentar no lo agrega.
    /// </summary>
    public const string BuyerIdRequired = "Fiscal.BuyerIdRequired";
}

/// <summary>Resultado de una emisión (aprobada o rechazada).</summary>
public sealed record EmitInvoiceResult(
    Guid DocumentId,
    bool Authorized,
    int PtoVta,
    string CbteTipo,
    long Number,
    string? Cae,
    DateOnly? CaeVto,
    IReadOnlyList<FiscalMessage> Observations,
    IReadOnlyList<FiscalMessage> Errors);

/// <summary>
/// Emite un comprobante fiscal de punta a punta: resuelve receptor y clase, toma
/// el TA, reserva el número (bajo advisory lock, reconciliado con ARCA — H14),
/// pide el CAE y persiste el FiscalDocument. Idempotente por número.
/// </summary>
public interface IInvoiceEmitter
{
    Task<Result<EmitInvoiceResult>> EmitAsync(EmitInvoiceCommand command, CancellationToken ct = default);
}
