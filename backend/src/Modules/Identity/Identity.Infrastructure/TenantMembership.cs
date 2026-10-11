namespace Identity.Infrastructure;

/// <summary>
/// Vínculo usuario ↔ tienda. Define qué tiendas puede administrar un usuario de
/// plataforma. Sin una fila acá, el usuario no tiene acceso a esa tienda.
/// </summary>
public sealed class TenantMembership
{
    public const string RoleOwner = "owner";  // acceso total, incl. gestión de staff
    public const string RoleStaff = "staff";  // opera la tienda, sin gestionar miembros

    public Guid Id { get; private set; }
    public Guid UserId { get; private set; }
    public Guid TenantId { get; private set; }
    public string Role { get; private set; } = RoleOwner;
    public DateTime CreatedAtUtc { get; private set; }

    private TenantMembership() { } // EF Core

    public static TenantMembership Create(Guid userId, Guid tenantId, string role = RoleOwner) => new()
    {
        Id = Guid.NewGuid(),
        UserId = userId,
        TenantId = tenantId,
        Role = Normalize(role),
        CreatedAtUtc = DateTime.UtcNow,
    };

    public void ChangeRole(string role) => Role = Normalize(role);

    public bool IsOwner => Role == RoleOwner;

    /// <summary>
    /// El rol tal cual, en minúsculas, si es uno de los que existen. Antes
    /// guardaba "staff" y convertía CUALQUIER otro en "owner": quedó de cuando
    /// había dos roles, y con la matriz de seis cada vendedor, persona de
    /// catálogo o de soporte que se sumaba al equipo entraba como dueño.
    /// </summary>
    private static string Normalize(string role)
    {
        var normalized = (role ?? string.Empty).Trim().ToLowerInvariant();
        return normalized == RoleStaff || RolePermissions.AssignableRoles.Contains(normalized)
            ? normalized
            : throw new ArgumentOutOfRangeException(nameof(role), role, "Rol inexistente.");
    }
}
