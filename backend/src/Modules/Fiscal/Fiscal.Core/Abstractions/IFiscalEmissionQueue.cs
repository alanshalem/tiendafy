using Fiscal.Core.Domain;
using SharedKernel.Common;

namespace Fiscal.Core.Abstractions;

/// <summary>Qué pasó al pedir encolar una nota de crédito.</summary>
public enum CreditNoteEnqueueResult
{
    /// <summary>Se encoló ahora.</summary>
    Queued,

    /// <summary>Ya estaba encolada (o emitida) por otro camino: no hay nada más que hacer.</summary>
    AlreadyQueued,

    /// <summary>
    /// No corresponde emitirla sola: la facturación no está habilitada, nadie
    /// la emite automáticamente, no hay factura del ambiente actual que
    /// acreditar o ya está acreditada entera. Volver a pedirlo da lo mismo
    /// mientras no cambie la configuración.
    /// </summary>
    NotApplicable,
}

/// <summary>
/// Encola la emisión automática de una orden. La decisión de facturar (módulo
/// habilitado, auto-factura activada, trigger que coincide con el evento) vive
/// acá: el caller sólo avisa qué pasó (se pagó / se despachó). Idempotente: no
/// encola dos veces la misma orden ni sobre una ya facturada.
/// </summary>
public interface IFiscalEmissionQueue
{
    /// <returns>true si se encoló; false si no correspondía (deshabilitado, trigger distinto, ya facturada).</returns>
    Task<bool> EnqueueInvoiceAsync(
        Guid tenantId, Guid orderId, long grossMinorUnits, string? buyerDoc,
        EmissionTrigger source, CancellationToken ct = default);

    /// <summary>
    /// Encola una nota de crédito de una orden: por un reembolso, una
    /// cancelación o un ajuste. Una orden puede tener varias, una por pedido
    /// (<see cref="CreditNoteRequest.IdempotencyKey"/>), y la suma nunca supera
    /// la factura que acreditan (la del ambiente actual).
    /// </summary>
    /// <returns>
    /// Qué pasó. Falla solo un pedido <see cref="CreditNoteRequest.Strict"/>
    /// (a mano) que no corresponde: sin factura, o más de lo que queda.
    /// </returns>
    Task<Result<CreditNoteEnqueued>> EnqueueCreditNoteAsync(CreditNoteRequest request, CancellationToken ct = default);
}

/// <summary>Un pedido de nota de crédito para la cola.</summary>
/// <param name="GrossMinorUnits">El monto a acreditar, en centavos.</param>
/// <param name="IdempotencyKey">Qué pedido es (ver <see cref="CreditNoteKeys"/>): el mismo pedido repetido no encola otra.</param>
/// <param name="BuyerDoc">
/// Solo informativo (queda en el job). La NC sale al receptor y con la clase
/// de la factura original, no a lo que diga hoy la venta: ver
/// <see cref="ComprobanteBuilder.BuildCreditNote"/>.
/// </param>
/// <param name="Force">
/// Se emite aunque la emisión automática de la tienda esté apagada: la pidió
/// el comercio (a mano, o tildando "emitir la nota de crédito" al reembolsar),
/// o la factura la emitió sola un canal con su propia auto-factura (Mercado
/// Libre) y la NC sale por el mismo camino.
/// </param>
/// <param name="Strict">
/// Un pedido explícito: si no entra en lo que queda por acreditar, es un error
/// (y no se recorta), y si no hay factura, también.
/// </param>
/// <param name="Reason">Motivo que escribió el comercio, si escribió uno.</param>
/// <param name="NotBefore">Desde cuándo lo toma el worker (ver <see cref="FiscalEmissionJob.Create"/>).</param>
public sealed record CreditNoteRequest(
    Guid TenantId, Guid OrderId, long GrossMinorUnits, string IdempotencyKey,
    string? BuyerDoc = null, bool Force = false, bool Strict = false,
    string? Reason = null, DateTime? NotBefore = null);

/// <summary>Resultado de encolar: qué pasó, el job y el monto que quedó (recortado al tope si era un reembolso).</summary>
public sealed record CreditNoteEnqueued(CreditNoteEnqueueResult Outcome, Guid? JobId, long AmountMinorUnits);
