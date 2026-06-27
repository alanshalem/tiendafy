using Identity.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Identity.Infrastructure;

/// <summary>Consulta y gestión de membresías usuario ↔ tienda (owner/staff).</summary>
public interface IMembershipService
{
    Task<bool> IsMemberAsync(Guid userId, Guid tenantId, CancellationToken ct = default);
    Task<bool> IsOwnerAsync(Guid userId, Guid tenantId, CancellationToken ct = default);
    Task<string?> RoleAsync(Guid userId, Guid tenantId, CancellationToken ct = default);
    Task<IReadOnlyList<Guid>> TenantIdsForUserAsync(Guid userId, CancellationToken ct = default);
    Task AddOwnerAsync(Guid userId, Guid tenantId, CancellationToken ct = default);

    Task<IReadOnlyList<TenantMembership>> ListAsync(Guid tenantId, CancellationToken ct = default);
    /// <summary>Alta o cambio de rol. No degrada al último owner. Devuelve false si bloqueado.</summary>
    Task<bool> UpsertAsync(Guid userId, Guid tenantId, string role, CancellationToken ct = default);
    /// <summary>Saca un miembro. No saca al último owner. Devuelve false si bloqueado/no existe.</summary>
    Task<bool> RemoveAsync(Guid userId, Guid tenantId, CancellationToken ct = default);
}

public sealed class MembershipService(AppIdentityDbContext db) : IMembershipService
{
    public Task<bool> IsMemberAsync(Guid userId, Guid tenantId, CancellationToken ct = default) =>
        db.TenantMemberships.AsNoTracking().AnyAsync(m => m.UserId == userId && m.TenantId == tenantId, ct);

    public Task<bool> IsOwnerAsync(Guid userId, Guid tenantId, CancellationToken ct = default) =>
        db.TenantMemberships.AsNoTracking().AnyAsync(m => m.UserId == userId && m.TenantId == tenantId && m.Role == TenantMembership.RoleOwner, ct);

    public async Task<string?> RoleAsync(Guid userId, Guid tenantId, CancellationToken ct = default) =>
        await db.TenantMemberships.AsNoTracking().Where(m => m.UserId == userId && m.TenantId == tenantId).Select(m => m.Role).FirstOrDefaultAsync(ct);

    public async Task<IReadOnlyList<Guid>> TenantIdsForUserAsync(Guid userId, CancellationToken ct = default) =>
        await db.TenantMemberships.AsNoTracking().Where(m => m.UserId == userId).Select(m => m.TenantId).ToListAsync(ct);

    public async Task AddOwnerAsync(Guid userId, Guid tenantId, CancellationToken ct = default)
    {
        if (await db.TenantMemberships.AnyAsync(m => m.UserId == userId && m.TenantId == tenantId, ct)) return;
        db.TenantMemberships.Add(TenantMembership.Create(userId, tenantId, TenantMembership.RoleOwner));
        await db.SaveChangesAsync(ct);
    }

    public async Task<IReadOnlyList<TenantMembership>> ListAsync(Guid tenantId, CancellationToken ct = default) =>
        await db.TenantMemberships.AsNoTracking().Where(m => m.TenantId == tenantId).OrderBy(m => m.CreatedAtUtc).ToListAsync(ct);

    public async Task<bool> UpsertAsync(Guid userId, Guid tenantId, string role, CancellationToken ct = default)
    {
        var existing = await db.TenantMemberships.FirstOrDefaultAsync(m => m.UserId == userId && m.TenantId == tenantId, ct);
        if (existing is null)
        {
            db.TenantMemberships.Add(TenantMembership.Create(userId, tenantId, role));
            await db.SaveChangesAsync(ct);
            return true;
        }
        // Degradar a staff al único owner deja la tienda sin dueño: bloquear.
        if (existing.IsOwner && role != TenantMembership.RoleOwner && await OwnerCountAsync(tenantId, ct) <= 1)
            return false;
        existing.ChangeRole(role);
        await db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<bool> RemoveAsync(Guid userId, Guid tenantId, CancellationToken ct = default)
    {
        var existing = await db.TenantMemberships.FirstOrDefaultAsync(m => m.UserId == userId && m.TenantId == tenantId, ct);
        if (existing is null) return false;
        if (existing.IsOwner && await OwnerCountAsync(tenantId, ct) <= 1) return false; // no sacar al último owner
        db.TenantMemberships.Remove(existing);
        await db.SaveChangesAsync(ct);
        return true;
    }

    private Task<int> OwnerCountAsync(Guid tenantId, CancellationToken ct) =>
        db.TenantMemberships.CountAsync(m => m.TenantId == tenantId && m.Role == TenantMembership.RoleOwner, ct);
}
