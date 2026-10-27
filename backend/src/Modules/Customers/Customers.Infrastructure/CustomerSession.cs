namespace Customers.Infrastructure;

/// <summary>
/// Sesión de comprador: token opaco (revocable) que viaja en la cookie de la
/// tienda o como `Authorization: Bearer &lt;token&gt;`. Sin JWT: revocar = borrar
/// fila. De la base solo sale el hash (<see cref="ShopperTokenHash"/>): el
/// token lo tiene únicamente el navegador del comprador.
/// </summary>
public sealed class CustomerSession
{
    public Guid Id { get; private set; }
    public Guid CustomerId { get; private set; }
    public Guid TenantId { get; private set; }
    /// <summary>SHA-256 (hex) del token; se busca con <see cref="ShopperTokenHash.Of"/>.</summary>
    public string TokenHash { get; private set; } = null!;
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime ExpiresAtUtc { get; private set; }

    private CustomerSession() { } // EF Core

    /// <param name="token">El token en claro: se guarda su hash.</param>
    public static CustomerSession Issue(Guid customerId, Guid tenantId, string token, TimeSpan lifetime) => new()
    {
        Id = Guid.NewGuid(),
        CustomerId = customerId,
        TenantId = tenantId,
        TokenHash = ShopperTokenHash.Of(token),
        CreatedAtUtc = DateTime.UtcNow,
        ExpiresAtUtc = DateTime.UtcNow.Add(lifetime),
    };

    public bool IsExpired => DateTime.UtcNow >= ExpiresAtUtc;
}
