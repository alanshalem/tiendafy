namespace Api.Notifications;

/// <summary>
/// URL pública de una tienda para links en emails: dominio propio (siempre
/// https) o subdominio bajo el dominio de la plataforma. El esquema del
/// subdominio es parámetro: los avisos y pedidos usan https fijo y las
/// campañas https salvo en localhost (ver StoreLinks.SubdomainScheme).
/// </summary>
public static class StoreUrls
{
    public static string For(string? customDomain, string subdomain, string platformDomain, string subdomainScheme = "http") =>
        !string.IsNullOrWhiteSpace(customDomain)
            ? $"https://{customDomain}"
            : $"{subdomainScheme}://{subdomain}.{platformDomain}";
}
