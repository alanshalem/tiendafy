using Microsoft.EntityFrameworkCore;
using Tenancy.Core.Application;
using Tenancy.Core.Domain;
using Tenancy.Infrastructure.Persistence;

namespace Api.Notifications;

/// <summary>
/// Los links públicos que salen en mails y avisos: la URL de cada tienda
/// (dominio propio o subdominio de la plataforma) y la base pública de la API
/// (bajas, tracking). Antes cada worker y endpoint leía
/// Tenancy:PlatformBaseDomain y PublicApiBaseUrl a mano y repetía el "cargar
/// la tienda → StoreUrls.For"; ahora se lee en un solo lugar.
/// </summary>
public sealed class StoreLinks(TenancyDbContext tenancy, TenancyOptions options, IConfiguration configuration)
{
    /// <summary>La API de desarrollo: lo que se usa mientras PublicApiBaseUrl no esté configurada.</summary>
    public const string DevApiBase = "http://localhost:5080";

    /// <summary>
    /// Tenancy:PlatformBaseDomain en minúsculas, para quien no tiene la DI a
    /// mano (CORS al arrancar, validación de redirects). El default es el
    /// mismo que el de <see cref="TenancyOptions"/>.
    /// </summary>
    public static string PlatformDomainOf(IConfiguration cfg) =>
        (cfg["Tenancy:PlatformBaseDomain"] ?? "localhost").ToLowerInvariant();

    /// <summary>Dominio de la plataforma, en minúsculas.</summary>
    public string PlatformDomain { get; } = options.PlatformBaseDomain.ToLowerInvariant();

    /// <summary>Base pública de la API (links de baja y de tracking).</summary>
    public string ApiBase => configuration["PublicApiBaseUrl"] ?? DevApiBase;

    /// <summary>
    /// Si la plataforma corre en una máquina de desarrollo (localhost o
    /// *.localhost), donde la tienda se sirve sin TLS. Es la misma regla que
    /// usan CORS y los redirects (<see cref="Api.Auth.SafeRedirect"/>).
    /// </summary>
    public static bool IsDevHost(string host)
    {
        var name = host.Split(':', 2)[0].ToLowerInvariant(); // "localhost:3000" también es dev
        return name == "localhost" || name.EndsWith(".localhost", StringComparison.Ordinal);
    }

    /// <summary>
    /// Esquema de los subdominios de la plataforma: https, salvo en
    /// desarrollo (localhost), donde la tienda no tiene certificado.
    /// </summary>
    public string SubdomainScheme => IsDevHost(PlatformDomain) ? "http" : "https";

    /// <summary>
    /// URL pública de la tienda. El esquema del subdominio sigue siendo
    /// parámetro, como en <see cref="StoreUrls"/>: los avisos y pedidos usan
    /// https fijo; las campañas, <see cref="SubdomainScheme"/>.
    /// </summary>
    public string For(string? customDomain, string subdomain, string subdomainScheme) =>
        StoreUrls.For(customDomain, subdomain, PlatformDomain, subdomainScheme);

    public string For(Tenant tenant, string subdomainScheme) =>
        For(tenant.CustomDomain, tenant.Subdomain.Value, subdomainScheme);

    /// <summary>La tienda y su URL pública; null si la tienda no existe.</summary>
    public async Task<StoreLink?> ForTenantAsync(Guid tenantId, string subdomainScheme, CancellationToken ct)
    {
        var tenant = await tenancy.Tenants.AsNoTracking().FirstOrDefaultAsync(t => t.Id == tenantId, ct);
        return tenant is null ? null : new StoreLink(tenant.Name, For(tenant, subdomainScheme));
    }

    /// <summary>
    /// La base de las cards de producto de una campaña: la tienda (https en
    /// producción, http solo en localhost), o el dominio de la plataforma si
    /// la tienda ya no existe. Antes iba siempre en http: en producción los
    /// links salían sin TLS y dependían del redirect de Caddy.
    /// </summary>
    public async Task<string> CampaignStoreBaseAsync(Guid tenantId, CancellationToken ct) =>
        (await ForTenantAsync(tenantId, SubdomainScheme, ct))?.Url ?? $"{SubdomainScheme}://{PlatformDomain}";
}

/// <summary>Nombre y URL pública de una tienda, para los mails.</summary>
public sealed record StoreLink(string Name, string Url);
