using Fiscal.Core.Abstractions;
using Fiscal.Core.Domain;
using Fiscal.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SharedKernel.Common;

namespace Fiscal.Infrastructure.Emission;

/// <summary>
/// Inserta jobs de emisión en el outbox. Filtra por tenant explícito (corre en
/// contexto sin tenant: worker de webhooks / endpoints admin, ambos con el filtro
/// global bypasseado). La unicidad (tenant,orden,tipo) la garantiza el índice.
/// </summary>
public sealed class FiscalEmissionQueue(FiscalDbContext db, ILogger<FiscalEmissionQueue> logger) : IFiscalEmissionQueue
{
    public async Task<bool> EnqueueInvoiceAsync(
        Guid tenantId, Guid orderId, long grossMinorUnits, string? buyerDoc,
        EmissionTrigger source, CancellationToken ct = default)
    {
        var cfg = await db.Configs.AsNoTracking().FirstOrDefaultAsync(c => c.TenantId == tenantId, ct);
        if (cfg is null || !cfg.Enabled || !cfg.AutoInvoiceEnabled) return false;
        if (cfg.Trigger != source) return false; // el evento no es el trigger configurado

        // Ya facturada en este ambiente o ya encolada (idempotencia por orden).
        // Una factura de homologación no cuenta en producción: ahí no existe.
        var alreadyInvoiced = await db.Documents.AsNoTracking().AnyAsync(
            d => d.TenantId == tenantId && d.OrderId == orderId && d.Environment == cfg.Environment
              && d.CbteTipo != CbteTipo.NotaCreditoA && d.CbteTipo != CbteTipo.NotaCreditoB && d.CbteTipo != CbteTipo.NotaCreditoC
              && d.Result == FiscalResult.Authorized, ct);
        if (alreadyInvoiced) return false;

        var existing = await db.EmissionJobs.FirstOrDefaultAsync(
            j => j.TenantId == tenantId && j.OrderId == orderId && j.Kind == FiscalJobKind.Invoice, ct);
        if (existing is not null)
            return await RestartIfFromOtherEnvironmentAsync(existing, cfg.Environment, grossMinorUnits, buyerDoc, ct);

        db.EmissionJobs.Add(FiscalEmissionJob.Create(tenantId, orderId, FiscalJobKind.Invoice, grossMinorUnits, buyerDoc));
        try
        {
            await db.SaveChangesAsync(ct);
            logger.LogInformation("Factura encolada (tenant {Tenant}, orden {Order}, trigger {Trigger}).", tenantId, orderId, source);
            return true;
        }
        catch (DbUpdateException)
        {
            // Carrera con otro enqueue: el índice único (tenant,orden,tipo) lo atajó.
            return false;
        }
    }

    public async Task<Result<CreditNoteEnqueued>> EnqueueCreditNoteAsync(CreditNoteRequest request, CancellationToken ct = default)
    {
        static Result<CreditNoteEnqueued> NotApplicable() => new CreditNoteEnqueued(CreditNoteEnqueueResult.NotApplicable, null, 0);

        var (tenantId, orderId) = (request.TenantId, request.OrderId);
        var cfg = await db.Configs.AsNoTracking().FirstOrDefaultAsync(c => c.TenantId == tenantId, ct);
        if (cfg is null || !cfg.Enabled)
            return request.Strict
                ? Result.Failure<CreditNoteEnqueued>(Error.Conflict("Fiscal.NotConfigured", "La facturación con ARCA no está configurada."))
                : NotApplicable();
        // Sola, solo si alguien emite solo (la tienda o el canal); a pedido, siempre.
        if (!cfg.AutoInvoiceEnabled && !request.Force) return NotApplicable();

        // El mismo pedido otra vez (el mismo reembolso, el mismo aviso, el doble
        // click): ya está, no se encola otra. Salvo que haya terminado en otro
        // ambiente: lo de homologación no existe para ARCA de producción.
        var existing = await db.EmissionJobs.FirstOrDefaultAsync(
            j => j.TenantId == tenantId && j.OrderId == orderId && j.Kind == FiscalJobKind.CreditNote
                 && j.IdempotencyKey == request.IdempotencyKey, ct);
        if (existing is not null
            && !await RestartIfFromOtherEnvironmentAsync(existing, cfg.Environment, existing.GrossMinorUnits, existing.BuyerDoc, ct))
            return new CreditNoteEnqueued(CreditNoteEnqueueResult.AlreadyQueued, existing.Id, existing.GrossMinorUnits);

        // Solo tiene sentido acreditar si hay una factura autorizada de la orden,
        // y del ambiente en que se va a emitir la NC (una de homologación no
        // existe para ARCA de producción). El receptor y la clase de la NC salen
        // de esa factura al emitir; el buyerDoc solo queda en el job.
        var balance = await CreditNoteLedger.BalanceAsync(db, tenantId, orderId, cfg.Environment,
            ownKey: request.IdempotencyKey, excludeOwn: true, ct: ct);
        if (balance is null)
            return request.Strict
                ? Result.Failure<CreditNoteEnqueued>(Error.Conflict(CreditNoteErrors.NoInvoice,
                    "La venta no tiene una factura autorizada para acreditar."))
                : NotApplicable();
        if (existing is not null)
            return new CreditNoteEnqueued(CreditNoteEnqueueResult.Queued, existing.Id, existing.GrossMinorUnits);

        // El tope: lo acreditado, lo que está en curso y esto nunca superan la
        // factura. Un pedido a mano que no entra es un error; un reembolso se
        // acredita hasta lo que queda (un reembolso no puede superar lo cobrado,
        // pero la factura pudo ser por menos).
        long amount;
        if (request.Strict)
        {
            var fits = CreditNoteLimit.Check(balance.InvoiceTotalMinor, balance.CreditedMinor, balance.InFlightMinor, request.GrossMinorUnits);
            if (fits.IsFailure) return Result.Failure<CreditNoteEnqueued>(fits.Error);
            amount = fits.Value;
        }
        else
        {
            amount = CreditNoteLimit.Clamp(balance.InvoiceTotalMinor, balance.CreditedMinor, balance.InFlightMinor, request.GrossMinorUnits);
            if (amount <= 0) return NotApplicable();
        }

        var job = FiscalEmissionJob.Create(tenantId, orderId, FiscalJobKind.CreditNote, amount, request.BuyerDoc,
            request.IdempotencyKey, request.Reason, request.NotBefore);
        db.EmissionJobs.Add(job);
        try
        {
            await db.SaveChangesAsync(ct);
            logger.LogInformation("Nota de crédito encolada (tenant {Tenant}, orden {Order}, clave {Key}, {Amount} centavos).",
                tenantId, orderId, request.IdempotencyKey, amount);
            return new CreditNoteEnqueued(CreditNoteEnqueueResult.Queued, job.Id, amount);
        }
        catch (DbUpdateException)
        {
            // Carrera con otro pedido igual: el índice único (tenant, orden, tipo, clave) lo atajó.
            db.Entry(job).State = EntityState.Detached;
            var winner = await db.EmissionJobs.AsNoTracking().FirstOrDefaultAsync(
                j => j.TenantId == tenantId && j.OrderId == orderId && j.Kind == FiscalJobKind.CreditNote
                     && j.IdempotencyKey == request.IdempotencyKey, ct);
            return new CreditNoteEnqueued(CreditNoteEnqueueResult.AlreadyQueued, winner?.Id, winner?.GrossMinorUnits ?? amount);
        }
    }

    /// <summary>
    /// El job de la orden ya existe. Si terminó con un comprobante de otro
    /// ambiente (lo facturado en homologación no existe para ARCA de
    /// producción), vuelve a empezar: hay uno solo por (tienda, orden, tipo).
    /// Si no, ya está en curso o hecho. Los que no terminaron se emiten en el
    /// ambiente configurado cuando el worker los tome, así que siguen valiendo.
    /// </summary>
    /// <returns>true si se reencoló.</returns>
    private async Task<bool> RestartIfFromOtherEnvironmentAsync(
        FiscalEmissionJob job, FiscalEnvironment env, long grossMinorUnits, string? buyerDoc, CancellationToken ct)
    {
        if (job is not { Status: FiscalJobStatus.Done, FiscalDocumentId: { } documentId }) return false;
        var otherEnvironment = await db.Documents.AsNoTracking().AnyAsync(
            d => d.TenantId == job.TenantId && d.Id == documentId && d.Environment != env, ct);
        if (!otherEnvironment) return false;

        job.Restart(grossMinorUnits, buyerDoc);
        await db.SaveChangesAsync(ct);
        logger.LogInformation("Job {Kind} reencolado en {Env}: el anterior terminó en otro ambiente (tenant {Tenant}, orden {Order}).",
            job.Kind, env, job.TenantId, job.OrderId);
        return true;
    }
}
