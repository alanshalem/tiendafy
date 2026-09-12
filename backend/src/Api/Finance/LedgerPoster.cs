using Finance.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Api.Finance;

/// <summary>
/// Lo que escribe en la cuenta corriente cuando pasa algo en otro módulo: una
/// venta a cuenta, la factura de un proveedor.
///
/// Vive en la API y no adentro de Finance a propósito: es el único lugar donde
/// se cruzan módulos, y los módulos no se conocen entre sí. Acá queda explícito
/// qué hecho de negocio genera qué movimiento.
///
/// Es IDEMPOTENTE por documento: cargar dos veces la misma factura del
/// proveedor no duplica la deuda. Sin eso, el primer usuario que aprieta
/// "guardar" dos veces deja un saldo que no existe y nadie sabe de dónde salió.
/// </summary>
public sealed class LedgerPoster(FinanceDbContext db)
{
    /// <summary>Una venta que el cliente se lleva sin pagar: nos queda debiendo.</summary>
    public async Task PostSaleAsync(
        Guid tenantId, Guid customerId, Guid orderId, string label, long amountMinor, string currency,
        DateTime occurredAtUtc, CancellationToken ct)
    {
        if (amountMinor <= 0) return;
        if (await ExistsAsync(tenantId, LedgerDocType.Sale, orderId, ct)) return;

        var entry = LedgerEntry.Create(
            tenantId, PartyKind.Customer, customerId, LedgerEntryKind.Debit, amountMinor, currency,
            LedgerDocType.Sale, label, orderId, occurredAtUtc);
        if (entry.IsFailure) return;

        db.LedgerEntries.Add(entry.Value);
        await db.SaveChangesAsync(ct);
    }

    /// <summary>
    /// La factura de un proveedor: le empezamos a deber. Si el importe cambia
    /// (corrigieron la carga), se reemplaza el movimiento anterior en vez de
    /// sumar uno nuevo — la deuda es una sola.
    /// </summary>
    public async Task PostPurchaseAsync(
        Guid tenantId, Guid supplierId, Guid purchaseOrderId, string label, long amountMinor, string currency,
        DateTime occurredAtUtc, CancellationToken ct)
    {
        var existing = await db.LedgerEntries.FirstOrDefaultAsync(
            l => l.TenantId == tenantId && l.DocType == LedgerDocType.Purchase && l.DocId == purchaseOrderId, ct);

        if (existing is not null)
        {
            // Ya se cobró contra esta factura: tocarla dejaría imputaciones
            // colgando. Se deja como está y el ajuste lo hace una persona.
            if (existing.SettledMinor > 0 || existing.AmountMinor == amountMinor) return;
            db.LedgerEntries.Remove(existing);
        }

        if (amountMinor <= 0)
        {
            if (existing is not null) await db.SaveChangesAsync(ct);
            return;
        }

        var entry = LedgerEntry.Create(
            tenantId, PartyKind.Supplier, supplierId, LedgerEntryKind.Credit, amountMinor, currency,
            LedgerDocType.Purchase, label, purchaseOrderId, occurredAtUtc);
        if (entry.IsFailure) return;

        db.LedgerEntries.Add(entry.Value);
        await db.SaveChangesAsync(ct);
    }

    private Task<bool> ExistsAsync(Guid tenantId, LedgerDocType docType, Guid docId, CancellationToken ct) =>
        db.LedgerEntries.AnyAsync(l => l.TenantId == tenantId && l.DocType == docType && l.DocId == docId, ct);
}
