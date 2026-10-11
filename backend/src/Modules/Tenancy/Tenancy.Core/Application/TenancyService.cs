using Tenancy.Contracts;
using Tenancy.Core.Domain;

namespace Tenancy.Core.Application;

/// <summary>Configuración del módulo: dominio base de la plataforma.</summary>
public sealed record TenancyOptions
{
    /// <summary>Ej: "tiendafy.com" — las tiendas viven en *.tiendafy.com.</summary>
    public required string PlatformBaseDomain { get; init; }
}

public sealed class TenancyService(ITenantRepository repository, TenancyOptions options) : ITenancyService
{
    public async Task<TenantDto?> ResolveByHostAsync(string host, CancellationToken ct = default)
    {
        var resolved = await ResolveExactAsync(host, ct);
        if (resolved is not null) return resolved;

        // "www.volxen.com.ar" tiene que llegar a la misma tienda que
        // "volxen.com.ar": el comercio carga un dominio y la gente escribe el
        // otro. Se reintenta sin el www —y también al revés, si lo cargó con
        // www— en vez de mostrarle "tienda no encontrada" a quien ya la buscó.
        var bare = host.Trim().ToLowerInvariant().Split(':')[0];
        return bare.StartsWith("www.", StringComparison.Ordinal)
            ? await ResolveExactAsync(bare[4..], ct)
            : await ResolveExactAsync("www." + bare, ct);
    }

    private async Task<TenantDto?> ResolveExactAsync(string host, CancellationToken ct)
    {
        var normalized = host.Trim().ToLowerInvariant().Split(':')[0]; // sin puerto

        var baseDomain = options.PlatformBaseDomain.ToLowerInvariant();
        var suffix = "." + baseDomain;

        Tenant? tenant;
        if (normalized.EndsWith(suffix, StringComparison.Ordinal))
        {
            // mitienda.tiendafy.com → subdominio "mitienda".
            // Sub-subdominios (a.b.tiendafy.com) no resuelven a tenant.
            var label = normalized[..^suffix.Length];
            if (label.Length == 0 || label.Contains('.'))
                return null;

            tenant = await repository.GetBySubdomainAsync(label, ct);
        }
        else
        {
            tenant = await repository.GetByCustomDomainAsync(normalized, ct);
        }

        // El storefront decide qué mostrar según Status (suspendida → página
        // de suspensión; cancelada → "tienda eliminada"). Por eso devolvemos
        // también las canceladas; null queda sólo para subdominios que nunca
        // existieron.
        return tenant?.ToDto();
    }

    public async Task<TenantDto?> GetByIdAsync(Guid tenantId, CancellationToken ct = default)
    {
        var tenant = await repository.GetByIdAsync(tenantId, ct);
        return tenant?.ToDto();
    }
}
