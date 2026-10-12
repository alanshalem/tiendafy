namespace Identity.Infrastructure;

/// <summary>
/// Vínculo usuario ↔ tienda. Define qué tiendas puede administrar un usuario de
/// plataforma y con qué rol. Sin una fila acá, el usuario no tiene acceso a esa tienda.
/// </summary>
public sealed class TenantMembership
{
    public Guid Id { get; private set; }
    public Guid UserId { get; private set; }
    public Guid TenantId { get; private set; }
    public string Role { get; private set; } = Roles.Owner;
    public DateTime CreatedAtUtc { get; private set; }

    private TenantMembership() { } // EF Core

    public static TenantMembership Create(Guid userId, Guid tenantId, string role = Roles.Owner) => new()
    {
        Id = Guid.NewGuid(),
        UserId = userId,
        TenantId = tenantId,
        Role = Normalize(role),
        CreatedAtUtc = DateTime.UtcNow,
    };

    public void ChangeRole(string role) => Role = Normalize(role);

    public bool IsOwner => Role == Roles.Owner;

    /// <summary>
    /// El rol tal cual, en minúsculas, si es uno de los que existen. Antes
    /// convertía cualquier rol desconocido en "owner": quedó de cuando había dos
    /// roles, y con la matriz cada vendedor que se sumaba entraba como dueño.
    /// </summary>
    private static string Normalize(string role)
    {
        var normalized = (role ?? string.Empty).Trim().ToLowerInvariant();
        return Roles.Exists(normalized)
            ? normalized
            : throw new ArgumentOutOfRangeException(nameof(role), role, "Rol inexistente.");
    }
}
