using SharedKernel.Common;

namespace SharedKernel.Abstractions;

/// <summary>
/// Tenant actual del request. Lo llena el TenancyMiddleware (Host header →
/// tenant); lo consumen los global query filters de EF Core y el
/// SET LOCAL app.tenant_id de cada transacción.
/// </summary>
public interface ITenantContext
{
    TenantId TenantId { get; }
    bool HasTenant { get; }
}
