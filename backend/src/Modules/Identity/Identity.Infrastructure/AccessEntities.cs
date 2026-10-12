namespace Identity.Infrastructure;

/// <summary>
/// Lo que una tienda le cambió a un rol respecto de lo que trae de fábrica.
/// Se guardan solo las diferencias (ver <see cref="AccessPolicy.Diff"/>).
/// </summary>
public sealed class RolePermissionOverride
{
    public Guid TenantId { get; private set; }
    public string Role { get; private set; } = string.Empty;
    public string Permission { get; private set; } = string.Empty;
    public bool Granted { get; private set; }

    private RolePermissionOverride() { } // EF Core

    public RolePermissionOverride(Guid tenantId, string role, PermissionOverride o)
    {
        TenantId = tenantId;
        Role = role;
        Permission = o.Key;
        Granted = o.Granted;
    }

    public PermissionOverride ToOverride() => new(Permission, Granted);
}

/// <summary>
/// Una excepción de una persona respecto de lo que da su rol en la tienda. Se
/// borran con la membresía (cascada) y al cambiarle el rol: un cambio de rol
/// es empezar de nuevo, no arrastrar permisos pensados para otro puesto.
/// </summary>
public sealed class MemberPermissionOverride
{
    public Guid MembershipId { get; private set; }
    public string Permission { get; private set; } = string.Empty;
    public bool Granted { get; private set; }

    private MemberPermissionOverride() { } // EF Core

    public MemberPermissionOverride(Guid membershipId, PermissionOverride o)
    {
        MembershipId = membershipId;
        Permission = o.Key;
        Granted = o.Granted;
    }

    public PermissionOverride ToOverride() => new(Permission, Granted);
}

/// <summary>
/// Quién cambió qué en el equipo de una tienda: altas, bajas, roles,
/// excepciones y la matriz. El texto se arma al momento del cambio, con los
/// nombres de ese momento: si después alguien cambia de nombre o se va, el
/// registro sigue diciendo lo que pasó.
/// </summary>
public sealed class AuditEvent
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid? ActorUserId { get; private set; }
    public string ActorName { get; private set; } = string.Empty;
    /// <summary>Qué tipo de cambio fue ("member.role", "role.permissions"…), para filtrar.</summary>
    public string Action { get; private set; } = string.Empty;
    public string Summary { get; private set; } = string.Empty;
    public DateTime CreatedAtUtc { get; private set; }

    private AuditEvent() { } // EF Core

    public AuditEvent(Guid tenantId, Guid? actorUserId, string actorName, string action, string summary)
    {
        Id = Guid.NewGuid();
        TenantId = tenantId;
        ActorUserId = actorUserId;
        ActorName = actorName;
        Action = action;
        Summary = summary;
        CreatedAtUtc = DateTime.UtcNow;
    }
}
