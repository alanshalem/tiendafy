namespace Customers.Infrastructure;

/// <summary>
/// Token de un solo uso para flujos del comprador: reset de contraseña y
/// verificación de email. Opaco, con expiración, marcable como usado. Se
/// guarda su hash (<see cref="ShopperTokenHash"/>): el token solo viaja en el mail.
/// </summary>
public sealed class CustomerToken
{
    public const string PurposeReset = "reset";
    public const string PurposeVerify = "verify";

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid CustomerId { get; private set; }
    public string Purpose { get; private set; } = null!;
    /// <summary>SHA-256 (hex) del token; se busca con <see cref="ShopperTokenHash.Of"/>.</summary>
    public string TokenHash { get; private set; } = null!;
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime ExpiresAtUtc { get; private set; }
    public DateTime? UsedAtUtc { get; private set; }

    private CustomerToken() { } // EF Core

    /// <param name="token">El token en claro (el del link): se guarda su hash.</param>
    public static CustomerToken Issue(Guid tenantId, Guid customerId, string purpose, string token, TimeSpan lifetime) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenantId,
        CustomerId = customerId,
        Purpose = purpose,
        TokenHash = ShopperTokenHash.Of(token),
        CreatedAtUtc = DateTime.UtcNow,
        ExpiresAtUtc = DateTime.UtcNow.Add(lifetime),
    };

    public bool IsValid(string purpose) =>
        UsedAtUtc is null && Purpose == purpose && DateTime.UtcNow < ExpiresAtUtc;

    public void Consume() => UsedAtUtc = DateTime.UtcNow;
}
