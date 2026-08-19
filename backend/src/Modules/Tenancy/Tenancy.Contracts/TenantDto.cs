namespace Tenancy.Contracts;

/// <summary>
/// Vista pública del tenant. Lo único que otros módulos (y middleware) ven.
/// </summary>
public sealed record TenantDto(
    Guid Id,
    string Name,
    string Subdomain,
    string? CustomDomain,
    string Status,
    DateTime CreatedAtUtc);
