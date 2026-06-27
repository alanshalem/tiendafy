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

    private static string Normalize(string role) => role == RoleStaff ? RoleStaff : RoleOwner;
}
