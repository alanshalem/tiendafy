using Fiscal.Core.Abstractions;
using Fiscal.Core.Domain;
using Fiscal.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;
using SharedKernel.Common;

namespace Api.Fiscal;

/// <summary>Cómo terminó una nota de crédito pedida a mano.</summary>
/// <param name="Queued">Quedó en la cola (ARCA no contestó o hubo que esperar): sale sola en unos minutos.</param>
public sealed record ManualCreditNoteResult(
    bool Queued, bool Authorized, Guid? DocumentId, string? CbteTipo, int? PtoVta, long? Number,
    string? Cae, IReadOnlyList<FiscalMessage> Errors);

/// <summary>
/// Las notas de crédito de una venta: una por cada reembolso (el del panel o
/// el que avisa la pasarela) y las que pide el comercio a mano (un ajuste, un
/// reembolso que no la emitió). Es orquestación (Orders + Fiscal + email) y por
/// eso vive en Api.
///
/// <para>
/// Todas van por el mismo camino seguro que las facturas: la cola de emisión
/// (reintentos), el write-ahead y la reconciliación del emisor. Cada pedido
/// lleva su clave (<see cref="CreditNoteKeys"/>): el mismo reembolso, el mismo
/// aviso repetido o el doble click no emiten dos. Y la suma nunca supera la
/// factura: lo controlan la cola al encolar y el emisor al emitir.
/// </para>
/// </summary>
public sealed class CreditNoteIssuer(
    IFiscalEmissionQueue queue,
    IInvoiceEmitter emitter,
    FiscalDbContext fiscal,
    InvoiceEmail email,
    ILogger<CreditNoteIssuer> logger)
{
    /// <summary>
    /// Cuánto espera el worker antes de tomar una NC pedida a mano: el panel
    /// la emite en el momento, y el worker solo la termina si ese intento no pudo.
    /// </summary>
    public static readonly TimeSpan ManualGrace = TimeSpan.FromMinutes(2);

    /// <summary>
    /// La NC de un reembolso: sale sola si la tienda emite automáticamente, o si
    /// el comercio la pidió al reembolsar (<paramref name="requested"/>). Por lo
    /// devuelto, hasta lo que queda de la factura. Best-effort: la plata ya se
    /// devolvió y una falla acá no puede tapar el reembolso.
    /// </summary>
    public async Task<CreditNoteEnqueued?> ForRefundAsync(
        Order order, long refundedMinor, string idempotencyKey, bool requested, CancellationToken ct = default)
    {
        try
        {
            var result = await queue.EnqueueCreditNoteAsync(new CreditNoteRequest(
                order.TenantId.Value, order.Id, refundedMinor, idempotencyKey, order.DocNumber, Force: requested), ct);
            return result.IsSuccess ? result.Value : null;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "No se pudo encolar la nota de crédito del reembolso de la venta {OrderId}.", order.Id);
            return null;
        }
    }

    /// <summary>
    /// La NC que pide el comercio desde la venta: por lo devuelto sin acreditar
    /// o por un ajuste (un precio corregido, un descuento posterior). Se encola
    /// (así tiene reintentos si ARCA no contesta) y se emite en el momento.
    /// </summary>
    /// <param name="clientKey">La clave que manda el panel: el mismo pedido repetido no emite otra.</param>
    public async Task<Result<ManualCreditNoteResult>> IssueManualAsync(
        Order order, long amountMinor, string clientKey, string? reason, CancellationToken ct = default)
    {
        var tenantId = order.TenantId.Value;
        var key = CreditNoteKeys.ForManual(clientKey);
        var enqueued = await queue.EnqueueCreditNoteAsync(new CreditNoteRequest(
            tenantId, order.Id, amountMinor, key, order.DocNumber, Force: true, Strict: true,
            Reason: reason, NotBefore: DateTime.UtcNow + ManualGrace), ct);
        if (enqueued.IsFailure) return Result.Failure<ManualCreditNoteResult>(enqueued.Error);

        var emitted = await emitter.EmitAsync(new EmitInvoiceCommand(
            tenantId, order.Id, enqueued.Value.AmountMinorUnits, order.DocNumber,
            CreditNote: true, IdempotencyKey: key), ct);

        var job = await fiscal.EmissionJobs.FirstOrDefaultAsync(j => j.TenantId == tenantId && j.OrderId == order.Id
            && j.Kind == FiscalJobKind.CreditNote && j.IdempotencyKey == key, ct);
        // Si el worker ya lo tomó, lo termina él (el emisor le va a decir que ya está).
        var mine = job is { Status: FiscalJobStatus.Pending };

        if (emitted.IsFailure && emitted.Error.Code == "Fiscal.AlreadyCredited")
        {
            var doc = await fiscal.Documents.AsNoTracking()
                .Where(d => d.TenantId == tenantId && d.OrderId == order.Id && d.IdempotencyKey == key
                            && d.Result == FiscalResult.Authorized)
                .OrderByDescending(d => d.CreatedAtUtc).FirstOrDefaultAsync(ct);
            if (doc is not null)
            {
                if (mine) job!.MarkDone(doc.Id);
                await fiscal.SaveChangesAsync(ct);
                return new ManualCreditNoteResult(false, true, doc.Id, doc.CbteTipo.ToString(), doc.PtoVta, doc.Number, doc.Cae, []);
            }
        }

        if (emitted.IsFailure)
        {
            // El tope o la falta de factura no se arreglan reintentando: el pedido
            // queda como fallido y vuelve el error. Lo demás (ARCA sin respuesta,
            // la red) queda en la cola: el worker lo reintenta y reconcilia.
            if (emitted.Error.Code is CreditNoteErrors.ExceedsInvoice or CreditNoteErrors.InvalidAmount or CreditNoteErrors.NoInvoice)
            {
                if (mine) job!.MarkFailed(emitted.Error.Message);
                await fiscal.SaveChangesAsync(ct);
                return Result.Failure<ManualCreditNoteResult>(emitted.Error);
            }
            logger.LogWarning("NC a mano de la venta {OrderId} quedó en la cola: {Code} {Message}",
                order.Id, emitted.Error.Code, emitted.Error.Message);
            return new ManualCreditNoteResult(true, false, null, null, null, null, null,
                [new FiscalMessage(emitted.Error.Code, emitted.Error.Message)]);
        }

        var r = emitted.Value;
        if (r.Authorized)
        {
            if (mine) job!.MarkDone(r.DocumentId);
            await fiscal.SaveChangesAsync(ct);
            await email.SendAsync(tenantId, r.DocumentId, ct);
            return new ManualCreditNoteResult(false, true, r.DocumentId, r.CbteTipo, r.PtoVta, r.Number, r.Cae, []);
        }

        // Rechazo de ARCA: es un dato, reintentar no ayuda. El motivo puede venir
        // en Errors o en Observaciones.
        var reasons = r.Errors.Concat(r.Observations)
            .Select(e => new FiscalMessage(e.Code, ArcaErrorCatalog.Describe(e.Code, e.Message))).ToList();
        if (mine) job!.MarkFailed(reasons.Count > 0 ? string.Join("; ", reasons.Select(e => e.Message)) : "Rechazada por ARCA sin detalle.");
        await fiscal.SaveChangesAsync(ct);
        return new ManualCreditNoteResult(false, false, r.DocumentId, r.CbteTipo, r.PtoVta, r.Number, null, reasons);
    }
}
