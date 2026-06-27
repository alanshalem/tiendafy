namespace Customers.Infrastructure;

/// <summary>
/// Token de un solo uso para flujos del comprador: reset de contraseña y
/// verificación de email. Opaco, con expiración, marcable como usado.
/// </summary>
public sealed class CustomerToken
{
    public const string PurposeReset = "reset";
    public const string PurposeVerify = "verify";

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid CustomerId { get; private set; }
    public string Purpose { get; private set; } = null!;
    public string Token { get; private set; } = null!;
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime ExpiresAtUtc { get; private set; }
    public DateTime? UsedAtUtc { get; private set; }

    private CustomerToken() { } // EF Core

    public static CustomerToken Issue(Guid tenantId, Guid customerId, string purpose, string token, TimeSpan lifetime) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenantId,
        CustomerId = customerId,
        Purpose = purpose,
        Token = token,
        CreatedAtUtc = DateTime.UtcNow,
        ExpiresAtUtc = DateTime.UtcNow.Add(lifetime),
    };

    public bool IsValid(string purpose) =>
        UsedAtUtc is null && Purpose == purpose && DateTime.UtcNow < ExpiresAtUtc;

    public void Consume() => UsedAtUtc = DateTime.UtcNow;
}
