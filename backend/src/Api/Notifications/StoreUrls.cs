namespace Api.Notifications;

/// <summary>
/// URL pública de una tienda para links en emails: dominio propio (siempre
/// https) o subdominio bajo el dominio de la plataforma. El esquema del
/// subdominio es parámetro porque los sitios existentes difieren (campañas
/// usan http para dev; carritos abandonados asume https) — unificar eso sería
/// un cambio de comportamiento, no un refactor.
/// </summary>
public static class StoreUrls
{
    public static string For(string? customDomain, string subdomain, string platformDomain, string subdomainScheme = "http") =>
        !string.IsNullOrWhiteSpace(customDomain)
            ? $"https://{customDomain}"
            : $"{subdomainScheme}://{subdomain}.{platformDomain}";
}
