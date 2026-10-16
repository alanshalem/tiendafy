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

        // Ya facturada o ya encolada (idempotencia por orden).
        var alreadyInvoiced = await db.Documents.AsNoTracking().AnyAsync(
            d => d.TenantId == tenantId && d.OrderId == orderId
              && d.CbteTipo != CbteTipo.NotaCreditoA && d.CbteTipo != CbteTipo.NotaCreditoB && d.CbteTipo != CbteTipo.NotaCreditoC
              && d.Result == FiscalResult.Authorized, ct);
        if (alreadyInvoiced) return false;

        var alreadyQueued = await db.EmissionJobs.AsNoTracking().AnyAsync(
            j => j.TenantId == tenantId && j.OrderId == orderId && j.Kind == FiscalJobKind.Invoice, ct);
        if (alreadyQueued) return false;

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

        var alreadyQueued = await db.EmissionJobs.AsNoTracking().AnyAsync(
            j => j.TenantId == tenantId && j.OrderId == orderId && j.Kind == FiscalJobKind.CreditNote, ct);
        if (alreadyQueued) return CreditNoteEnqueueResult.AlreadyQueued;

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
}
