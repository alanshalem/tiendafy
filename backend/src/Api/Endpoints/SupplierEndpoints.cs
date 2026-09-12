using Api.Auth;
using Finance.Infrastructure;
using Identity.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Purchasing.Infrastructure;
using SharedKernel.Abstractions;

namespace Api.Endpoints;

/// <summary>
/// Ficha de proveedor: lo que convierte un texto libre en alguien con historia.
///
/// Cada proveedor trae de dos módulos distintos lo que hace falta para decidir:
/// sus compras (Purchasing) y su saldo (Finance). No hay clave foránea entre
/// ellos —son módulos separados— así que el cruce se hace acá, por id.
/// </summary>
public static class SupplierEndpoints
{
    public static RouteGroupBuilder MapSupplierEndpoints(this RouteGroupBuilder group)
    {
        var suppliers = group.MapGroup("/suppliers").RequireTenant().RequirePermission(Permission.Purchasing);

        suppliers.MapGet("/", async (
            ITenantContext tenant, PurchasingDbContext db, FinanceDbContext finance, CancellationToken ct,
            string? q = null, bool includeInactive = false) =>
        {
            var tid = tenant.TenantId.Value;
            var query = db.Suppliers.AsNoTracking().Where(s => s.TenantId == tid);
            if (!includeInactive) query = query.Where(s => s.Active);
            if (!string.IsNullOrWhiteSpace(q))
            {
                var term = q.Trim().ToLower();
                query = query.Where(s => s.Name.ToLower().Contains(term) || (s.TaxId != null && s.TaxId.Contains(term)));
            }

            var rows = await query.OrderBy(s => s.Name).Take(200).ToListAsync(ct);
            var ids = rows.Select(s => s.Id).ToList();

            // Compras y saldo de todos de una sola vez: el listado no puede
            // hacer dos consultas por proveedor.
            var purchases = await db.PurchaseOrders.AsNoTracking()
                .Where(p => p.TenantId == tid && p.SupplierId != null && ids.Contains(p.SupplierId!.Value))
                .GroupBy(p => p.SupplierId!.Value)
                .Select(g => new { SupplierId = g.Key, Count = g.Count(), Last = g.Max(p => p.CreatedAtUtc) })
                .ToDictionaryAsync(x => x.SupplierId, x => x, ct);

            var balances = await finance.LedgerEntries.AsNoTracking()
                .Where(l => l.TenantId == tid && l.PartyKind == PartyKind.Supplier && ids.Contains(l.PartyId))
                .GroupBy(l => l.PartyId)
                .Select(g => new
                {
                    PartyId = g.Key,
                    Debit = g.Where(l => l.Kind == LedgerEntryKind.Debit).Sum(l => (long?)l.AmountMinor) ?? 0,
                    Credit = g.Where(l => l.Kind == LedgerEntryKind.Credit).Sum(l => (long?)l.AmountMinor) ?? 0,
                })
                .ToDictionaryAsync(x => x.PartyId, x => x.Debit - x.Credit, ct);

            return Results.Ok(new
            {
                items = rows.Select(s => new
                {
                    id = s.Id,
                    name = s.Name,
                    taxId = s.TaxId,
                    email = s.Email,
                    phone = s.Phone,
                    country = s.Country,
                    active = s.Active,
                    purchaseCount = purchases.GetValueOrDefault(s.Id)?.Count ?? 0,
                    lastPurchaseAtUtc = purchases.GetValueOrDefault(s.Id)?.Last,
                    // Negativo = le debemos. El signo se lee desde nuestro lado,
                    // igual que en toda la cuenta corriente.
                    balanceMinor = balances.GetValueOrDefault(s.Id),
                }),
            });
        });

        suppliers.MapGet("/{id:guid}", async (
            Guid id, ITenantContext tenant, PurchasingDbContext db, FinanceDbContext finance, CancellationToken ct) =>
        {
            var tid = tenant.TenantId.Value;
            var supplier = await db.Suppliers.AsNoTracking().FirstOrDefaultAsync(s => s.Id == id && s.TenantId == tid, ct);
            if (supplier is null) return Results.NotFound();

            var orders = await db.PurchaseOrders.AsNoTracking()
                .Where(p => p.TenantId == tid && p.SupplierId == id)
                .OrderByDescending(p => p.CreatedAtUtc).Take(50)
                .Select(p => new
                {
                    id = p.Id,
                    reference = p.Reference,
                    status = p.Status.ToString().ToLowerInvariant(),
                    currency = p.Currency,
                    createdAtUtc = p.CreatedAtUtc,
                    invoiceNumber = p.InvoiceNumber,
                })
                .ToListAsync(ct);

            var entries = await finance.LedgerEntries.AsNoTracking()
                .Where(l => l.TenantId == tid && l.PartyKind == PartyKind.Supplier && l.PartyId == id)
                .ToListAsync(ct);

            return Results.Ok(new
            {
                id = supplier.Id,
                name = supplier.Name,
                taxId = supplier.TaxId,
                email = supplier.Email,
                phone = supplier.Phone,
                address = supplier.Address,
                country = supplier.Country,
                notes = supplier.Notes,
                active = supplier.Active,
                createdAtUtc = supplier.CreatedAtUtc,
                balanceMinor = entries.Sum(e => e.SignedAmountMinor),
                purchases = orders,
            });
        });

        suppliers.MapPost("/", async (
            SupplierRequest req, ITenantContext tenant, PurchasingDbContext db, CancellationToken ct) =>
        {
            var created = Supplier.Create(tenant.TenantId.Value, req.Name);
            if (created.IsFailure) return created.Error.ToProblem();

            var updated = created.Value.Update(
                req.Name, req.TaxId, req.Email, req.Phone, req.Address, req.Country, req.Notes, req.Active ?? true);
            if (updated.IsFailure) return updated.Error.ToProblem();

            db.Suppliers.Add(created.Value);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/suppliers/{created.Value.Id}", new { id = created.Value.Id });
        });

        suppliers.MapPatch("/{id:guid}", async (
            Guid id, SupplierRequest req, ITenantContext tenant, PurchasingDbContext db, CancellationToken ct) =>
        {
            var tid = tenant.TenantId.Value;
            var supplier = await db.Suppliers.FirstOrDefaultAsync(s => s.Id == id && s.TenantId == tid, ct);
            if (supplier is null) return Results.NotFound();

            var updated = supplier.Update(
                req.Name, req.TaxId, req.Email, req.Phone, req.Address, req.Country, req.Notes, req.Active ?? true);
            if (updated.IsFailure) return updated.Error.ToProblem();

            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        return group;
    }
}

public sealed record SupplierRequest(
    string? Name, string? TaxId, string? Email, string? Phone,
    string? Address, string? Country, string? Notes, bool? Active);
