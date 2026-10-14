using Microsoft.EntityFrameworkCore;
using Purchasing.Infrastructure;

namespace Api.Purchasing;

/// <summary>
/// Que cada compra quede atada a una ficha de proveedor.
///
/// Compras deja escribir el proveedor como texto libre (es lo rápido cuando se
/// carga una importación), y Proveedores se armó después: el resultado era una
/// pantalla de Proveedores vacía al lado de un listado de compras lleno de
/// nombres. Acá se resuelve el texto a una ficha —la que ya existe con ese
/// nombre, sin mayúsculas, o una nueva— tanto al guardar una compra como al
/// traer el histórico desde Proveedores.
/// </summary>
public static class SupplierLinker
{
    /// <summary>
    /// La ficha para una compra: la elegida (si es de la tienda) o la que se
    /// llama igual, creándola si no existe. Null si el nombre no alcanza para
    /// una ficha (una letra suelta); la compra igual se guarda con su texto.
    /// No guarda: lo hace quien llama, junto con la compra.
    /// </summary>
    /// <param name="known">Fichas ya resueltas en esta pasada, por nombre: dos
    /// compras del mismo proveedor nuevo no crean dos fichas antes de guardar.</param>
    public static async Task<Supplier?> ResolveAsync(
        PurchasingDbContext db, Guid tenantId, Guid? supplierId, string? supplierName,
        CancellationToken ct, Dictionary<string, Supplier>? known = null)
    {
        if (supplierId is { } id)
        {
            var chosen = await db.Suppliers.FirstOrDefaultAsync(s => s.Id == id && s.TenantId == tenantId, ct);
            if (chosen is not null) return chosen;
        }

        var name = supplierName?.Trim();
        if (string.IsNullOrEmpty(name)) return null;
        var key = name.ToLowerInvariant();
        if (known?.TryGetValue(key, out var cached) == true) return cached;

        var existing = await db.Suppliers
            .Where(s => s.TenantId == tenantId && s.Name.ToLower() == key)
            .OrderByDescending(s => s.Active).ThenBy(s => s.CreatedAtUtc)
            .FirstOrDefaultAsync(ct);
        if (existing is null)
        {
            var created = Supplier.Create(tenantId, name);
            if (created.IsFailure) return null;
            existing = created.Value;
            db.Suppliers.Add(existing);
        }

        if (known is not null) known[key] = existing;
        return existing;
    }

    /// <summary>
    /// "Traer de mis compras": ata a una ficha cada compra que quedó solo con el
    /// nombre escrito, y le pasa a la ficha el CUIT de la factura si no tenía.
    /// No asienta en la cuenta corriente las facturas viejas: si ya se pagaron
    /// por fuera, aparecería una deuda que no existe.
    /// </summary>
    /// <returns>Fichas nuevas y compras atadas.</returns>
    public static async Task<(int Created, int Linked)> LinkHistoryAsync(
        PurchasingDbContext db, Guid tenantId, CancellationToken ct)
    {
        var loose = await db.PurchaseOrders
            .Where(p => p.TenantId == tenantId && p.SupplierId == null)
            .OrderBy(p => p.CreatedAtUtc)
            .ToListAsync(ct);

        var known = new Dictionary<string, Supplier>();
        var before = await db.Suppliers.CountAsync(s => s.TenantId == tenantId, ct);
        var linked = 0;
        foreach (var po in loose)
        {
            var supplier = await ResolveAsync(db, tenantId, null, po.SupplierName, ct, known);
            if (supplier is null) continue;
            po.LinkSupplier(supplier.Id);
            linked++;

            if (supplier.TaxId is null && !string.IsNullOrWhiteSpace(po.SupplierTaxId))
                supplier.Update(supplier.Name, po.SupplierTaxId, supplier.Email, supplier.Phone,
                    supplier.Address, supplier.Country, supplier.Notes, supplier.Active);
        }

        await db.SaveChangesAsync(ct);
        var after = await db.Suppliers.CountAsync(s => s.TenantId == tenantId, ct);
        return (after - before, linked);
    }
}
