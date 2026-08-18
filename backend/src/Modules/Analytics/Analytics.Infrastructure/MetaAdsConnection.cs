namespace Analytics.Infrastructure;

/// <summary>
/// Conexión de la tienda con Meta Ads (token largo de usuario, ~60 días) para
/// leer el GASTO de pauta y calcular ROAS real. Token cifrado con
/// DataProtection — nunca sale por la API.
/// </summary>
public sealed class MetaAdsConnection
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }

    public string AccessTokenEncrypted { get; private set; } = string.Empty;
    public DateTime? TokenExpiresAtUtc { get; private set; }

    /// <summary>Cuenta publicitaria elegida (act_…); null hasta que el merchant elige.</summary>
    public string? AdAccountId { get; private set; }
    public string? AdAccountName { get; private set; }

    public DateTime ConnectedAtUtc { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }

    private MetaAdsConnection() { } // EF Core

    public static MetaAdsConnection Create(Guid tenantId, string accessTokenEncrypted, DateTime? expiresAtUtc) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenantId,
        AccessTokenEncrypted = accessTokenEncrypted,
        TokenExpiresAtUtc = expiresAtUtc,
        ConnectedAtUtc = DateTime.UtcNow,
        UpdatedAtUtc = DateTime.UtcNow,
    };

    public void UpdateToken(string accessTokenEncrypted, DateTime? expiresAtUtc)
    {
        AccessTokenEncrypted = accessTokenEncrypted;
        TokenExpiresAtUtc = expiresAtUtc;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void SelectAdAccount(string adAccountId, string? name)
    {
        AdAccountId = adAccountId;
        AdAccountName = name;
        UpdatedAtUtc = DateTime.UtcNow;
    }
}
