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
    /// Reembolso de una venta a cuenta corriente: la plata nunca entró, así
    /// que "devolverla" es bajarle la deuda al cliente. Queda como nota de
    /// crédito (Haber) y, lo que alcance, se imputa a la venta: así la venta
    /// deja de figurar pendiente por lo que ya se devolvió y un cobro posterior
    /// no se puede imputar dos veces contra lo mismo.
    ///
    /// Si la venta ya estaba cobrada, no queda nada que imputar y el crédito
    /// deja al cliente con saldo a favor, que es exactamente lo que pasó.
    ///
    /// Idempotente por reembolso (<paramref name="refundId"/>). Devuelve false
    /// si la venta no tiene asiento en la cuenta corriente (no se fió, o el
    /// asiento falló al venderla): no hay deuda que bajar.
    /// </summary>
    public async Task<bool> PostSaleRefundAsync(
        Guid tenantId, Guid orderId, Guid refundId, string label, long amountMinor, string currency,
        DateTime occurredAtUtc, string? reason, CancellationToken ct)
    {
        if (amountMinor <= 0) return false;

        var sale = await db.LedgerEntries.FirstOrDefaultAsync(
            l => l.TenantId == tenantId && l.DocType == LedgerDocType.Sale && l.DocId == orderId, ct);
        if (sale is null) return false;
        if (await ExistsAsync(tenantId, LedgerDocType.CreditNote, refundId, ct)) return true;

        var entry = LedgerEntry.Create(
            tenantId, sale.PartyKind, sale.PartyId, LedgerEntryKind.Credit, amountMinor, currency,
            LedgerDocType.CreditNote, label, refundId, occurredAtUtc, reason);
        if (entry.IsFailure) return false;

        var toSettle = Math.Min(sale.PendingMinor, amountMinor);
        if (toSettle > 0) sale.Settle(toSettle);

        db.LedgerEntries.Add(entry.Value);
        await db.SaveChangesAsync(ct);
        return true;
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
