using Fiscal.Core.Domain;
using Fiscal.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Fiscal.Infrastructure.Emission;

/// <summary>
/// Cuánto de la factura de una venta ya está acreditado, en un ambiente. En
/// centavos.
/// </summary>
/// <param name="Invoice">La factura autorizada que acreditan las NC (la última del ambiente).</param>
/// <param name="CreditedMinor">Notas de crédito autorizadas.</param>
/// <param name="InFlightMinor">
/// Notas de crédito en curso: comprobantes que esperan la respuesta de ARCA y
/// pedidos en la cola que todavía no tienen comprobante. Cuentan para el tope:
/// pueden terminar autorizados.
/// </param>
public sealed record CreditNoteBalance(FiscalDocument Invoice, long CreditedMinor, long InFlightMinor)
{
    public long InvoiceTotalMinor => CreditNoteLimit.ToMinor(Invoice.ImpTotal);

    /// <summary>Lo que todavía se puede acreditar.</summary>
    public long RemainingMinor => CreditNoteLimit.Remaining(InvoiceTotalMinor, CreditedMinor, InFlightMinor);
}

/// <summary>
/// La cuenta de las notas de crédito de una venta: la usan la cola (antes de
/// encolar), el emisor (el último corte, con el lock de la venta tomado) y el
/// panel (cuánto queda, cuánto se devolvió sin acreditar). Una sola cuenta
/// para los tres.
/// </summary>
public static class CreditNoteLedger
{
    private static readonly CbteTipo[] Invoices = [CbteTipo.FacturaA, CbteTipo.FacturaB, CbteTipo.FacturaC];
    private static readonly CbteTipo[] CreditNotes = [CbteTipo.NotaCreditoA, CbteTipo.NotaCreditoB, CbteTipo.NotaCreditoC];

    /// <summary>La factura autorizada de la venta en el ambiente (la última), o null.</summary>
    public static Task<FiscalDocument?> InvoiceAsync(
        FiscalDbContext db, Guid tenantId, Guid orderId, FiscalEnvironment env, CancellationToken ct) =>
        db.Documents.AsNoTracking()
            .Where(d => d.TenantId == tenantId && d.OrderId == orderId && d.Environment == env
                        && d.Result == FiscalResult.Authorized && Invoices.Contains(d.CbteTipo))
            .OrderByDescending(d => d.CreatedAtUtc)
            .FirstOrDefaultAsync(ct);

    /// <summary>
    /// El saldo de la factura de la venta, o null si no hay factura que acreditar.
    /// </summary>
    /// <param name="ownKey">
    /// La clave del pedido que se está encolando o emitiendo (null = una NC
    /// vieja, de antes de las claves): lo suyo no cuenta como "en curso" (si
    /// quedó esperando a ARCA, la reconciliación lo resuelve). Sin
    /// <paramref name="excludeOwn"/>, cuenta todo.
    /// </param>
    /// <param name="includeQueued">Sumar los pedidos de la cola sin comprobante (al encolar sí; al emitir, la cola ya pasó su control).</param>
    public static async Task<CreditNoteBalance?> BalanceAsync(
        FiscalDbContext db, Guid tenantId, Guid orderId, FiscalEnvironment env,
        string? ownKey = null, bool excludeOwn = false, bool includeQueued = true, CancellationToken ct = default)
    {
        var invoice = await InvoiceAsync(db, tenantId, orderId, env, ct);
        if (invoice is null) return null;

        var notes = await db.Documents.AsNoTracking()
            .Where(d => d.TenantId == tenantId && d.OrderId == orderId && d.Environment == env
                        && CreditNotes.Contains(d.CbteTipo)
                        && (d.Result == FiscalResult.Authorized || d.Result == FiscalResult.Pending))
            .Select(d => new { d.Result, d.ImpTotal, d.IdempotencyKey })
            .ToListAsync(ct);

        var credited = notes.Where(n => n.Result == FiscalResult.Authorized).Sum(n => CreditNoteLimit.ToMinor(n.ImpTotal));
        var inFlight = notes
            .Where(n => n.Result == FiscalResult.Pending && !(excludeOwn && n.IdempotencyKey == ownKey))
            .Sum(n => CreditNoteLimit.ToMinor(n.ImpTotal));

        if (includeQueued)
        {
            // Los pedidos que esperan en la cola y todavía no tienen comprobante
            // (si ya lo tienen, ya se contó arriba). Un fallido no reserva nada:
            // si se reintenta, el emisor vuelve a controlar el tope.
            var withDocument = notes.Select(n => n.IdempotencyKey ?? string.Empty).ToHashSet();
            var queued = await db.EmissionJobs.AsNoTracking()
                .Where(j => j.TenantId == tenantId && j.OrderId == orderId && j.Kind == FiscalJobKind.CreditNote
                            && (j.Status == FiscalJobStatus.Pending || j.Status == FiscalJobStatus.Processing))
                .Select(j => new { j.IdempotencyKey, j.GrossMinorUnits })
                .ToListAsync(ct);
            inFlight += queued
                .Where(j => !withDocument.Contains(j.IdempotencyKey) && !(excludeOwn && j.IdempotencyKey == (ownKey ?? string.Empty)))
                .Sum(j => j.GrossMinorUnits);
        }

        return new CreditNoteBalance(invoice, credited, inFlight);
    }
}
