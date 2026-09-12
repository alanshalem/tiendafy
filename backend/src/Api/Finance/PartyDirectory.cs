using Customers.Infrastructure;
using Finance.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Purchasing.Infrastructure;

namespace Api.Finance;

/// <summary>
/// De dónde sale el nombre de un cliente o de un proveedor.
///
/// La cuenta corriente guarda un id y nada más: quién es esa persona lo sabe
/// otro módulo. Acá se hace el cruce, que es de ida (id → nombre) y de vuelta
/// (texto → contactos), y en los dos casos por lote, porque el listado de
/// saldos tiene tantas filas como contactos con deuda.
/// </summary>
public sealed class PartyDirectory(CustomersDbContext customers, PurchasingDbContext purchasing)
{
    public async Task<Dictionary<Guid, string>> NamesAsync(
        Guid tenantId, PartyKind kind, IReadOnlyCollection<Guid> ids, CancellationToken ct)
    {
        if (ids.Count == 0) return [];

        return kind == PartyKind.Supplier
            ? await purchasing.Suppliers.AsNoTracking()
                .Where(s => s.TenantId == tenantId && ids.Contains(s.Id))
                .ToDictionaryAsync(s => s.Id, s => s.Name, ct)
            : await customers.Customers.AsNoTracking()
                .Where(c => c.TenantId == tenantId && ids.Contains(c.Id))
                .ToDictionaryAsync(c => c.Id, c => c.Name, ct);
    }

    public async Task<string?> NameAsync(Guid tenantId, PartyKind kind, Guid id, CancellationToken ct) =>
        (await NamesAsync(tenantId, kind, [id], ct)).GetValueOrDefault(id);

    public async Task<IReadOnlyList<PartyOption>> SearchAsync(
        Guid tenantId, PartyKind kind, string? q, CancellationToken ct)
    {
        var term = q?.Trim();

        if (kind == PartyKind.Supplier)
        {
            var query = purchasing.Suppliers.AsNoTracking().Where(s => s.TenantId == tenantId && s.Active);
            if (!string.IsNullOrWhiteSpace(term))
                query = query.Where(s => EF.Functions.ILike(s.Name, $"%{term}%"));
            return await query.OrderBy(s => s.Name).Take(50)
                .Select(s => new PartyOption(s.Id, s.Name, s.TaxId)).ToListAsync(ct);
        }

        // El teléfono y la dirección del cliente están cifrados en reposo, así
        // que la búsqueda es por nombre y mail — lo mismo que hace la agenda.
        var people = customers.Customers.AsNoTracking().Where(c => c.TenantId == tenantId);
        if (!string.IsNullOrWhiteSpace(term))
            people = people.Where(c => EF.Functions.ILike(c.Name, $"%{term}%")
                                       || (c.Email != null && EF.Functions.ILike(c.Email, $"%{term}%")));
        return await people.OrderBy(c => c.Name).Take(50)
            .Select(c => new PartyOption(c.Id, c.Name, c.Email)).ToListAsync(ct);
    }
}

public sealed record PartyOption(Guid Id, string Name, string? Detail);
