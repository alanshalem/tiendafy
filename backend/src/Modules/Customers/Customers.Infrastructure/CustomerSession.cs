namespace Customers.Infrastructure;

/// <summary>
/// Sesión de comprador: token opaco persistido (revocable). Lo manda el
/// storefront como `Authorization: Bearer &lt;token&gt;`. Sin JWT: revocar = borrar fila.
/// </summary>
public sealed class CustomerSession
{
    public Guid Id { get; private set; }
    public Guid CustomerId { get; private set; }
    public Guid TenantId { get; private set; }
    public string Token { get; private set; } = null!;
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime ExpiresAtUtc { get; private set; }

    private CustomerSession() { } // EF Core

    public static CustomerSession Issue(Guid customerId, Guid tenantId, string token, TimeSpan lifetime) => new()
    {
        Id = Guid.NewGuid(),
        CustomerId = customerId,
        TenantId = tenantId,
        Token = token,
        CreatedAtUtc = DateTime.UtcNow,
        ExpiresAtUtc = DateTime.UtcNow.Add(lifetime),
    };

    public bool IsExpired => DateTime.UtcNow >= ExpiresAtUtc;
}
