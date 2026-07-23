using Microsoft.Extensions.Configuration;

namespace Api.Auth;

/// <summary>
/// Validación de URLs de retorno/redirect para evitar open-redirect y phishing.
/// Un destino es "propio" si es un path relativo o un host de la plataforma
/// (localhost/*.localhost en dev; dominio de plataforma + subdominios de tienda
/// en prod).
/// </summary>
public static class SafeRedirect
{
    /// <summary>¿El host pertenece a la plataforma/tienda? (sin exigir esquema).</summary>
    public static bool IsOwnHost(string host, IConfiguration cfg)
    {
        host = host.ToLowerInvariant();
        if (host == "localhost" || host.EndsWith(".localhost", StringComparison.Ordinal)) return true;
        var platform = (cfg["Tenancy:PlatformBaseDomain"] ?? "localhost").ToLowerInvariant();
        return host == platform || host.EndsWith("." + platform, StringComparison.Ordinal);
    }

    /// <summary>Acepta path relativo propio o URL absoluta http(s) de un host propio.</summary>
    public static bool IsSafeReturnUrl(string? url, IConfiguration cfg)
    {
        if (string.IsNullOrWhiteSpace(url)) return false;
        if (url.StartsWith('/') && !url.StartsWith("//", StringComparison.Ordinal)) return true;
        if (!Uri.TryCreate(url, UriKind.Absolute, out var u)) return false;
        if (u.Scheme != Uri.UriSchemeHttp && u.Scheme != Uri.UriSchemeHttps) return false;
        return IsOwnHost(u.Host, cfg);
    }

    /// <summary>
    /// Exige URL ABSOLUTA http(s) de un host propio (para las back_urls de
    /// MercadoPago, que no aceptan paths relativos). Devuelve la URL normalizada
    /// sin barra final, o null si no es segura.
    /// </summary>
    public static string? SafeAbsoluteBase(string? url, IConfiguration cfg)
    {
        if (string.IsNullOrWhiteSpace(url)) return null;
        if (!Uri.TryCreate(url, UriKind.Absolute, out var u)) return null;
        if (u.Scheme != Uri.UriSchemeHttp && u.Scheme != Uri.UriSchemeHttps) return null;
        return IsOwnHost(u.Host, cfg) ? url.TrimEnd('/') : null;
    }
}
