using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace Api.Middleware;

/// <summary>
/// Implementación mutable por-request de ITenantContext.
/// </summary>
public sealed class TenantContextHolder : ITenantContext
{
    private TenantId? _tenantId;

    public TenantId TenantId => _tenantId
        ?? throw new InvalidOperationException("No tenant resolved for this request.");

    public bool HasTenant => _tenantId.HasValue;

    public void Set(TenantId tenantId) => _tenantId = tenantId;
}

/// <summary>
/// Resuelve el tenant del request desde el header X-Tenant-Id.
/// Interim: cuando Identity tenga memberships, el tenant saldrá de la sesión
/// (admin) o del Host (storefront API pública), no de un header confiable
/// solo en dev.
/// </summary>
public sealed class TenantContextMiddleware(RequestDelegate next)
{
    public const string HeaderName = "X-Tenant-Id";

    public async Task InvokeAsync(HttpContext context, TenantContextHolder holder)
    {
        if (context.Request.Headers.TryGetValue(HeaderName, out var raw)
            && Guid.TryParse(raw.ToString(), out var tenantId)
            && tenantId != Guid.Empty)
        {
            holder.Set(TenantId.From(tenantId));
        }

        await next(context);
    }
}
