using Api.Notifications;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Tenancy.Infrastructure.Persistence;

namespace Api.Shop;

/// <summary>
/// Los hosts de cada tienda: su subdominio de la plataforma, su dominio propio
/// (con o sin www) y, para la tienda principal, el dominio pelado. Con eso se
/// decide desde dónde vale la sesión del comprador y adónde apuntan los links
/// de los mails de su cuenta.
///
/// <para>
/// Nada de esto sale del <c>Origin</c> del request: antes los links de reset,
/// activación y demás se armaban con él si era "propio", y propio era
/// cualquier host de la plataforma. Quien pedía el mail con el <c>Origin</c> de
/// otra tienda (o del host de las fotos) mandaba el link con el token de la
/// víctima a una página con la medición de otro comercio.
/// </para>
/// </summary>
public sealed class StoreOrigins(TenancyDbContext tenancy, IMemoryCache cache, IConfiguration configuration, IHostEnvironment environment)
{
    /// <summary>El puerto de la tienda en desarrollo (<c>next dev</c>).</summary>
    public const int DevStorefrontPort = 3000;

    private static readonly TimeSpan CacheFor = TimeSpan.FromMinutes(1);

    private string Platform => StoreLinks.PlatformDomainOf(configuration);

    /// <summary>
    /// El subdominio de la tienda que atiende el dominio pelado. La tienda y el
    /// panel lo leen de <c>PRIMARY_STORE_SUBDOMAIN</c>; la API, de
    /// <c>Tenancy:PrimaryStoreSubdomain</c> (el compose la arma con esa misma variable).
    /// </summary>
    private string? PrimaryStore =>
        (configuration["Tenancy:PrimaryStoreSubdomain"] ?? configuration["PRIMARY_STORE_SUBDOMAIN"])?.Trim().ToLowerInvariant() is { Length: > 0 } s ? s : null;

    /// <summary>
    /// La URL canónica de la tienda, para los links de los mails de la cuenta
    /// del comprador (sin barra al final): su dominio propio, el dominio pelado
    /// si es la tienda principal, o su subdominio. Null si la tienda no existe.
    /// </summary>
    public async Task<string?> CanonicalBaseAsync(Guid tenantId, CancellationToken ct)
    {
        var store = await HostsAsync(tenantId, ct);
        if (store is null) return null;
        if (store.CustomDomain is not null) return $"https://{store.CustomDomain}";

        var platform = Platform;
        var dev = StoreLinks.IsDevHost(platform);
        var scheme = dev ? "http" : "https";
        var port = dev ? $":{DevStorefrontPort}" : string.Empty;
        var host = store.Subdomain == PrimaryStore ? platform : $"{store.Subdomain}.{platform}";
        return $"{scheme}://{host}{port}";
    }

    /// <summary>
    /// ¿Vale la sesión del comprador de esta tienda en este pedido? Sin
    /// <c>Origin</c> sí (la tienda armando la página en el servidor, un pedido
    /// del mismo origen); con <c>Origin</c>, solo si es un host de ESA tienda o
    /// la propia API. La cookie (<c>shop_&lt;tienda&gt;</c>) es del host de la
    /// API y viaja desde cualquier tienda: sin esto, un script en la tienda A
    /// mandaba <c>X-Tenant-Id</c> de la tienda B y actuaba como su comprador.
    /// </summary>
    public async Task<bool> AllowsSessionAsync(HttpRequest request, Guid tenantId, CancellationToken ct)
    {
        var origin = request.Headers.Origin.ToString();
        if (string.IsNullOrEmpty(origin)) return true;
        if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri)) return false;
        var host = uri.Host.ToLowerInvariant();
        if (host == request.Host.Host.ToLowerInvariant()) return true; // la propia API

        var store = await HostsAsync(tenantId, ct);
        if (store is null) return false;

        var platform = Platform;
        if (host == $"{store.Subdomain}.{platform}") return true;
        if (store.CustomDomain is { } custom && (host == custom || host == $"www.{custom}" || $"www.{host}" == custom)) return true;

        // El dominio pelado (o su www) es de la tienda principal. En desarrollo,
        // sin la variable configurada en la API, localhost:3000 atiende la que
        // diga la tienda: se acepta para cualquiera (solo en Development).
        if (host == platform || host == $"www.{platform}")
            return store.Subdomain == PrimaryStore || (PrimaryStore is null && environment.IsDevelopment());
        return false;
    }

    private async Task<StoreHosts?> HostsAsync(Guid tenantId, CancellationToken ct)
    {
        var key = $"store-hosts:{tenantId:N}";
        if (cache.TryGetValue(key, out StoreHosts? cached)) return cached;
        var row = await tenancy.Tenants.AsNoTracking().FirstOrDefaultAsync(t => t.Id == tenantId, ct);
        var hosts = row is null ? null : new StoreHosts(row.Subdomain.Value.ToLowerInvariant(), row.CustomDomain?.ToLowerInvariant());
        cache.Set(key, hosts, CacheFor);
        return hosts;
    }

    private sealed record StoreHosts(string Subdomain, string? CustomDomain);
}
