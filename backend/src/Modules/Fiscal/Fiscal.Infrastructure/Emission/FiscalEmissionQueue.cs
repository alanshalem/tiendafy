using Fiscal.Core.Abstractions;
using Fiscal.Core.Domain;
using Fiscal.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

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

    public async Task<CreditNoteEnqueueResult> EnqueueCreditNoteAsync(
        Guid tenantId, Guid orderId, long grossMinorUnits, string? buyerDoc,
        bool channelAutoInvoice = false, CancellationToken ct = default)
    {
        var cfg = await db.Configs.AsNoTracking().FirstOrDefaultAsync(c => c.TenantId == tenantId, ct);
        if (cfg is null || !cfg.Enabled) return CreditNoteEnqueueResult.NotApplicable;
        if (!cfg.AutoInvoiceEnabled && !channelAutoInvoice) return CreditNoteEnqueueResult.NotApplicable;

        // Sólo tiene sentido acreditar si hay una factura autorizada de la orden,
        // y del ambiente en que se va a emitir la NC (una de homologación no
        // existe para ARCA de producción). El receptor y la clase de la NC salen
        // de esa factura al emitir; el buyerDoc solo queda en el job.
        var hasInvoice = await db.Documents.AsNoTracking().AnyAsync(
            d => d.TenantId == tenantId && d.OrderId == orderId && d.Environment == cfg.Environment
              && (d.CbteTipo == CbteTipo.FacturaA || d.CbteTipo == CbteTipo.FacturaB || d.CbteTipo == CbteTipo.FacturaC)
              && d.Result == FiscalResult.Authorized, ct);
        if (!hasInvoice) return CreditNoteEnqueueResult.NotApplicable;

        var existing = await db.EmissionJobs.FirstOrDefaultAsync(
            j => j.TenantId == tenantId && j.OrderId == orderId && j.Kind == FiscalJobKind.CreditNote, ct);
        if (existing is not null)
            return await RestartIfFromOtherEnvironmentAsync(existing, cfg.Environment, grossMinorUnits, buyerDoc, ct)
                ? CreditNoteEnqueueResult.Queued
                : CreditNoteEnqueueResult.AlreadyQueued;

        db.EmissionJobs.Add(FiscalEmissionJob.Create(tenantId, orderId, FiscalJobKind.CreditNote, grossMinorUnits, buyerDoc));
        try
        {
            await db.SaveChangesAsync(ct);
            logger.LogInformation("Nota de crédito encolada (tenant {Tenant}, orden {Order}).", tenantId, orderId);
            return CreditNoteEnqueueResult.Queued;
        }
        catch (DbUpdateException)
        {
            // Carrera con otro enqueue: el índice único (tenant,orden,tipo) lo atajó.
            return CreditNoteEnqueueResult.AlreadyQueued;
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
