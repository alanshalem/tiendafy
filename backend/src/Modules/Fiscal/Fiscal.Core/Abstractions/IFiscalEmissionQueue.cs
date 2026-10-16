using Fiscal.Core.Domain;

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
    /// la emite automáticamente, o no hay factura del ambiente actual que acreditar.
    /// Volver a pedirlo da lo mismo mientras no cambie la configuración.
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
    /// Encola una nota de crédito para una orden reembolsada o cancelada. Sólo
    /// procede si la orden tiene una factura autorizada en el ambiente actual
    /// (algo que acreditar) y alguien la emite automáticamente: la tienda o el
    /// canal que emitió la factura.
    /// </summary>
    /// <param name="buyerDoc">
    /// Solo informativo (queda en el job). La NC sale al receptor y con la clase
    /// de la factura original, no a lo que diga hoy la venta: ver
    /// <see cref="Domain.ComprobanteBuilder.BuildCreditNote"/>.
    /// </param>
    /// <param name="channelAutoInvoice">
    /// La factura la emitió sola un canal con su propia auto-factura (Mercado
    /// Libre): la NC sale por el mismo camino aunque la emisión automática de la
    /// tienda esté apagada. Una venta que se factura sola y se acredita a mano
    /// quedaba con la factura viva de una venta anulada.
    /// </param>
    Task<CreditNoteEnqueueResult> EnqueueCreditNoteAsync(
        Guid tenantId, Guid orderId, long grossMinorUnits, string? buyerDoc,
        bool channelAutoInvoice = false, CancellationToken ct = default);
}
