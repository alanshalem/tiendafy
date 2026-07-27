using Fiscal.Core.Domain;

namespace Fiscal.Core.Abstractions;

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
    /// Encola una nota de crédito para una orden reembolsada. Sólo procede si la
    /// orden tiene una factura autorizada (algo que acreditar) y auto-factura activa.
    /// </summary>
    /// <returns>true si se encoló; false si no correspondía (sin factura previa, deshabilitado, ya encolada).</returns>
    Task<bool> EnqueueCreditNoteAsync(
        Guid tenantId, Guid orderId, long grossMinorUnits, string? buyerDoc, CancellationToken ct = default);
}
