using Identity.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Identity.Infrastructure;

/// <summary>Cómo terminó un cambio en el equipo.</summary>
public enum MembershipChange
{
    Done,
    NotFound,
    AlreadyMember,
    /// <summary>Bloqueado: la tienda se quedaría sin dueño.</summary>
    LastOwner,
}

/// <summary>Consulta y gestión de membresías usuario ↔ tienda.</summary>
public interface IMembershipService
{
    Task<bool> IsOwnerAsync(Guid userId, Guid tenantId, CancellationToken ct = default);
    Task<string?> RoleAsync(Guid userId, Guid tenantId, CancellationToken ct = default);
    Task<IReadOnlyList<Guid>> TenantIdsForUserAsync(Guid userId, CancellationToken ct = default);
    Task AddOwnerAsync(Guid userId, Guid tenantId, CancellationToken ct = default);

    Task<IReadOnlyList<TenantMembership>> ListAsync(Guid tenantId, CancellationToken ct = default);
    Task<MembershipChange> AddAsync(Guid userId, Guid tenantId, string role, CancellationToken ct = default);
    /// <summary>Cambia el rol y borra las excepciones de la persona (eran para el rol anterior).</summary>
    Task<MembershipChange> ChangeRoleAsync(Guid userId, Guid tenantId, string role, CancellationToken ct = default);
    Task<MembershipChange> RemoveAsync(Guid userId, Guid tenantId, CancellationToken ct = default);
}

public sealed class MembershipService(AppIdentityDbContext db) : IMembershipService
{
    public Task<bool> IsOwnerAsync(Guid userId, Guid tenantId, CancellationToken ct = default) =>
        db.TenantMemberships.AsNoTracking().AnyAsync(m => m.UserId == userId && m.TenantId == tenantId && m.Role == Roles.Owner, ct);

    public async Task<string?> RoleAsync(Guid userId, Guid tenantId, CancellationToken ct = default) =>
        await db.TenantMemberships.AsNoTracking().Where(m => m.UserId == userId && m.TenantId == tenantId).Select(m => m.Role).FirstOrDefaultAsync(ct);

    public async Task<IReadOnlyList<Guid>> TenantIdsForUserAsync(Guid userId, CancellationToken ct = default) =>
        await db.TenantMemberships.AsNoTracking().Where(m => m.UserId == userId).Select(m => m.TenantId).ToListAsync(ct);

    public async Task AddOwnerAsync(Guid userId, Guid tenantId, CancellationToken ct = default) =>
        await AddAsync(userId, tenantId, Roles.Owner, ct);

    public async Task<IReadOnlyList<TenantMembership>> ListAsync(Guid tenantId, CancellationToken ct = default) =>
        await db.TenantMemberships.AsNoTracking().Where(m => m.TenantId == tenantId).OrderBy(m => m.CreatedAtUtc).ToListAsync(ct);

    public async Task<MembershipChange> AddAsync(Guid userId, Guid tenantId, string role, CancellationToken ct = default)
    {
        if (await db.TenantMemberships.AnyAsync(m => m.UserId == userId && m.TenantId == tenantId, ct))
            return MembershipChange.AlreadyMember;
        db.TenantMemberships.Add(TenantMembership.Create(userId, tenantId, role));
        await db.SaveChangesAsync(ct);
        return MembershipChange.Done;
    }

    public async Task<MembershipChange> ChangeRoleAsync(Guid userId, Guid tenantId, string role, CancellationToken ct = default)
    {
        var existing = await FindAsync(userId, tenantId, ct);
        if (existing is null) return MembershipChange.NotFound;
        if (existing.Role == role) return MembershipChange.Done;
        if (existing.IsOwner && role != Roles.Owner && await OwnerCountAsync(tenantId, ct) <= 1)
            return MembershipChange.LastOwner;

        existing.ChangeRole(role);
        await db.MemberPermissionOverrides.Where(o => o.MembershipId == existing.Id).ExecuteDeleteAsync(ct);
        await db.SaveChangesAsync(ct);
        return MembershipChange.Done;
    }

    public async Task<MembershipChange> RemoveAsync(Guid userId, Guid tenantId, CancellationToken ct = default)
    {
        var existing = await FindAsync(userId, tenantId, ct);
        if (existing is null) return MembershipChange.NotFound;
        if (existing.IsOwner && await OwnerCountAsync(tenantId, ct) <= 1) return MembershipChange.LastOwner;
        db.TenantMemberships.Remove(existing); // las excepciones se van en cascada
        await db.SaveChangesAsync(ct);
        return MembershipChange.Done;
    }

    private Task<TenantMembership?> FindAsync(Guid userId, Guid tenantId, CancellationToken ct) =>
        db.TenantMemberships.FirstOrDefaultAsync(m => m.UserId == userId && m.TenantId == tenantId, ct);

    private Task<int> OwnerCountAsync(Guid tenantId, CancellationToken ct) =>
        db.TenantMemberships.CountAsync(m => m.TenantId == tenantId && m.Role == Roles.Owner, ct);
}
