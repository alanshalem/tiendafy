namespace Social.Infrastructure;

/// <summary>
/// Cuenta social conectada por la tienda (una página de Facebook, un perfil de
/// Instagram Business, una cuenta de X, un canal de Telegram…). El token es un
/// JSON de forma variable por red, cifrado con DataProtection — nunca en claro
/// ni hacia el browser. Diseño tomado de Mixpost: upsert por (provider,
/// provider_id) para que reconectar repare el token sin duplicar, y flag
/// Authorized que un 401 apaga (el publicador la saltea y avisa).
/// </summary>
public sealed class SocialAccount
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }

    /// <summary>Clave del canal: meta_facebook | meta_instagram | x | telegram.</summary>
    public string Provider { get; private set; } = string.Empty;

    /// <summary>Id de la cuenta EN la red (page id, ig user id, user id, chat id).</summary>
    public string ProviderId { get; private set; } = string.Empty;

    public string Name { get; private set; } = string.Empty;
    public string? Username { get; private set; }
    public string? AvatarUrl { get; private set; }

    /// <summary>JSON cifrado con los tokens que la red necesite (page token, user token, bot token…).</summary>
    public string AccessTokenEncrypted { get; private set; } = string.Empty;

    /// <summary>Extra por red en claro (sin secretos): ej. server, page vinculada del IG.</summary>
    public string? DataJson { get; private set; }

    /// <summary>false = el token murió (401): reconectar. El publicador la saltea.</summary>
    public bool Authorized { get; private set; } = true;

    public DateTime ConnectedAtUtc { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }

    private SocialAccount() { } // EF Core

    public static SocialAccount Create(
        Guid tenantId, string provider, string providerId, string name,
        string? username, string? avatarUrl, string accessTokenEncrypted, string? dataJson = null) => new()
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Provider = provider,
            ProviderId = providerId,
            Name = name,
            Username = username,
            AvatarUrl = avatarUrl,
            AccessTokenEncrypted = accessTokenEncrypted,
            DataJson = dataJson,
            ConnectedAtUtc = DateTime.UtcNow,
            UpdatedAtUtc = DateTime.UtcNow,
        };

    /// <summary>Reconexión: token nuevo + datos frescos, la cuenta vuelve a estar autorizada.</summary>
    public void Reauthorize(string accessTokenEncrypted, string name, string? username, string? avatarUrl, string? dataJson)
    {
        AccessTokenEncrypted = accessTokenEncrypted;
        Name = name;
        Username = username;
        AvatarUrl = avatarUrl;
        DataJson = dataJson;
        Authorized = true;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>Token renovado (refresh de X): cambia solo el token, el resto queda.</summary>
    public void RotateToken(string accessTokenEncrypted)
    {
        AccessTokenEncrypted = accessTokenEncrypted;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void MarkUnauthorized()
    {
        Authorized = false;
        UpdatedAtUtc = DateTime.UtcNow;
    }
}
