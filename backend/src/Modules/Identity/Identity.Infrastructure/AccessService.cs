using Identity.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Identity.Infrastructure;

/// <summary>Un rol en una tienda: lo que puede y lo que traía de fábrica.</summary>
public sealed record RoleAccess(RoleInfo Role, IReadOnlySet<Permission> Permissions, IReadOnlySet<Permission> Defaults);

/// <summary>Lo que cambió al guardar una matriz (para el registro de actividad).</summary>
public sealed record PermissionChange(IReadOnlySet<Permission> Added, IReadOnlySet<Permission> Removed)
{
    public bool IsEmpty => Added.Count == 0 && Removed.Count == 0;
}

/// <summary>
/// Qué puede hacer cada quien en cada tienda, y la edición de la matriz.
/// Scoped: lo resuelto se memoriza durante el request (el middleware de
/// escrituras, el filtro del grupo y el del endpoint preguntan lo mismo).
/// </summary>
public interface IAccessService
{
    /// <summary>Lo que puede la persona en la tienda, o null si no es del equipo.</summary>
    Task<MemberAccess?> GetAsync(Guid userId, Guid tenantId, CancellationToken ct = default);

    /// <summary>Todo el equipo de la tienda, por usuario.</summary>
    Task<IReadOnlyDictionary<Guid, MemberAccess>> MembersAsync(Guid tenantId, CancellationToken ct = default);

    /// <summary>La matriz de la tienda: cada rol con lo que puede y lo que traía de fábrica.</summary>
    Task<IReadOnlyList<RoleAccess>> RolesAsync(Guid tenantId, CancellationToken ct = default);

    /// <summary>Deja al rol pudiendo exactamente <paramref name="desired"/> (lo de fábrica = restaurar).</summary>
    Task<PermissionChange> SetRoleAsync(Guid tenantId, string role, IReadOnlySet<Permission> desired, CancellationToken ct = default);

    /// <summary>Deja a la persona pudiendo exactamente <paramref name="desired"/>; null si no es del equipo.</summary>
    Task<PermissionChange?> SetMemberAsync(Guid tenantId, Guid userId, IReadOnlySet<Permission> desired, CancellationToken ct = default);
}

public sealed class AccessService(AppIdentityDbContext db) : IAccessService
{
    private readonly Dictionary<(Guid, Guid), MemberAccess?> _resolved = [];

    public async Task<MemberAccess?> GetAsync(Guid userId, Guid tenantId, CancellationToken ct = default)
    {
        if (_resolved.TryGetValue((userId, tenantId), out var cached)) return cached;

        var membership = await db.TenantMemberships.AsNoTracking()
            .Where(m => m.UserId == userId && m.TenantId == tenantId)
            .Select(m => new { m.Id, m.Role })
            .FirstOrDefaultAsync(ct);

        MemberAccess? access = null;
        if (membership is not null)
        {
            var memberOverrides = await MemberOverridesAsync([membership.Id], ct);
            var mine = memberOverrides.GetValueOrDefault(membership.Id, []);
            access = new MemberAccess(
                membership.Role,
                AccessPolicy.ForMember(membership.Role, await OverridesOfRoleAsync(tenantId, membership.Role, ct), mine),
                mine.Count > 0 && membership.Role != Roles.Owner);
        }
        return _resolved[(userId, tenantId)] = access;
    }

    public async Task<IReadOnlyDictionary<Guid, MemberAccess>> MembersAsync(Guid tenantId, CancellationToken ct = default)
    {
        var memberships = await db.TenantMemberships.AsNoTracking()
            .Where(m => m.TenantId == tenantId)
            .Select(m => new { m.Id, m.UserId, m.Role })
            .ToListAsync(ct);
        var roleOverrides = await RoleOverridesAsync(tenantId, role: null, ct);
        var memberOverrides = await MemberOverridesAsync([.. memberships.Select(m => m.Id)], ct);

        return memberships.ToDictionary(m => m.UserId, m =>
        {
            var mine = memberOverrides.GetValueOrDefault(m.Id, []);
            return new MemberAccess(
                m.Role,
                AccessPolicy.ForMember(m.Role, roleOverrides.Where(o => o.Role == m.Role).Select(o => o.Override), mine),
                mine.Count > 0 && m.Role != Roles.Owner);
        });
    }

    public async Task<IReadOnlyList<RoleAccess>> RolesAsync(Guid tenantId, CancellationToken ct = default)
    {
        var overrides = await RoleOverridesAsync(tenantId, role: null, ct);
        return [.. Roles.All.Select(r => new RoleAccess(
            r,
            AccessPolicy.ForRole(r.Key, overrides.Where(o => o.Role == r.Key).Select(o => o.Override)),
            AccessPolicy.Defaults(r.Key)))];
    }

    public async Task<PermissionChange> SetRoleAsync(
        Guid tenantId, string role, IReadOnlySet<Permission> desired, CancellationToken ct = default)
    {
        var rows = await db.RolePermissionOverrides.Where(o => o.TenantId == tenantId && o.Role == role).ToListAsync(ct);
        var before = AccessPolicy.ForRole(role, rows.Select(o => o.ToOverride()));
        var diff = AccessPolicy.Diff(AccessPolicy.Defaults(role), desired);

        db.RolePermissionOverrides.RemoveRange(rows);
        db.RolePermissionOverrides.AddRange(diff.Select(o => new RolePermissionOverride(tenantId, role, o)));
        await db.SaveChangesAsync(ct);
        _resolved.Clear();

        return ChangeBetween(before, AccessPolicy.ForRole(role, diff));
    }

    public async Task<PermissionChange?> SetMemberAsync(
        Guid tenantId, Guid userId, IReadOnlySet<Permission> desired, CancellationToken ct = default)
    {
        var membership = await db.TenantMemberships.AsNoTracking()
            .FirstOrDefaultAsync(m => m.UserId == userId && m.TenantId == tenantId, ct);
        if (membership is null) return null;

        var roleOverrides = await OverridesOfRoleAsync(tenantId, membership.Role, ct);
        var rows = await db.MemberPermissionOverrides.Where(o => o.MembershipId == membership.Id).ToListAsync(ct);
        var before = AccessPolicy.ForMember(membership.Role, roleOverrides, rows.Select(o => o.ToOverride()));
        var diff = AccessPolicy.Diff(AccessPolicy.ForRole(membership.Role, roleOverrides), desired);

        db.MemberPermissionOverrides.RemoveRange(rows);
        db.MemberPermissionOverrides.AddRange(diff.Select(o => new MemberPermissionOverride(membership.Id, o)));
        await db.SaveChangesAsync(ct);
        _resolved.Clear();

        return ChangeBetween(before, AccessPolicy.ForMember(membership.Role, roleOverrides, diff));
    }

    private static PermissionChange ChangeBetween(IReadOnlySet<Permission> before, IReadOnlySet<Permission> after) =>
        new(after.Except(before).ToHashSet(), before.Except(after).ToHashSet());

    private async Task<List<PermissionOverride>> OverridesOfRoleAsync(Guid tenantId, string role, CancellationToken ct) =>
        [.. (await RoleOverridesAsync(tenantId, role, ct)).Select(o => o.Override)];

    private async Task<List<(string Role, PermissionOverride Override)>> RoleOverridesAsync(
        Guid tenantId, string? role, CancellationToken ct)
    {
        var rows = await db.RolePermissionOverrides.AsNoTracking()
            .Where(o => o.TenantId == tenantId && (role == null || o.Role == role))
            .ToListAsync(ct);
        return [.. rows.Select(o => (o.Role, o.ToOverride()))];
    }

    private async Task<Dictionary<Guid, List<PermissionOverride>>> MemberOverridesAsync(
        IReadOnlyCollection<Guid> membershipIds, CancellationToken ct)
    {
        var rows = await db.MemberPermissionOverrides.AsNoTracking()
            .Where(o => membershipIds.Contains(o.MembershipId))
            .ToListAsync(ct);
        return rows.GroupBy(o => o.MembershipId).ToDictionary(g => g.Key, g => g.Select(o => o.ToOverride()).ToList());
    }
}
