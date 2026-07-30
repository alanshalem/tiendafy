using SharedKernel.Common;

namespace MercadoLibre.Infrastructure;

/// <summary>
/// Conexión OAuth de la tienda con Mercado Libre (una por tenant). Los tokens
/// van SIEMPRE cifrados con DataProtection: el access token dura ~6 horas y el
/// refresh token es DE UN SOLO USO (Mercado Libre lo rota en cada refresh), por
/// eso la renovación se serializa por tenant en MeliTokenService.
/// </summary>
public sealed class MeliConnection
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }

    /// <summary>User id del vendedor en Mercado Libre (resuelve tenant en webhooks).</summary>
    public long MeliUserId { get; private set; }
    public string Nickname { get; private set; } = string.Empty;

    /// <summary>Site del vendedor (MLA = Argentina). Define moneda y categorías.</summary>
    public string SiteId { get; private set; } = "MLA";

    public string AccessTokenEnc { get; private set; } = string.Empty;
    public string RefreshTokenEnc { get; private set; } = string.Empty;
    public DateTime TokenExpiresAtUtc { get; private set; }

    /// <summary>Sincronizar stock Tiendafy → ML para publicaciones vinculadas.</summary>
    public bool StockSyncEnabled { get; private set; }

    public DateTime ConnectedAtUtc { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }

    private MeliConnection() { } // EF Core

    public static Result<MeliConnection> Create(
        Guid tenantId, long meliUserId, string nickname, string siteId,
        string accessTokenEnc, string refreshTokenEnc, DateTime tokenExpiresAtUtc)
    {
        if (tenantId == Guid.Empty)
            return Result.Failure<MeliConnection>(Error.Validation("Meli.Tenant", "Tenant requerido."));
        if (meliUserId <= 0)
            return Result.Failure<MeliConnection>(Error.Validation("Meli.User", "User id de Mercado Libre inválido."));
        if (string.IsNullOrWhiteSpace(accessTokenEnc))
            return Result.Failure<MeliConnection>(Error.Validation("Meli.Token", "Token vacío."));

        return Result.Success<MeliConnection>(new MeliConnection
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            MeliUserId = meliUserId,
            Nickname = nickname.Trim(),
            SiteId = string.IsNullOrWhiteSpace(siteId) ? "MLA" : siteId.Trim().ToUpperInvariant(),
            AccessTokenEnc = accessTokenEnc,
            RefreshTokenEnc = refreshTokenEnc,
            TokenExpiresAtUtc = tokenExpiresAtUtc,
            StockSyncEnabled = false,
            ConnectedAtUtc = DateTime.UtcNow,
            UpdatedAtUtc = DateTime.UtcNow,
        });
    }

    /// <summary>Re-conexión o refresh: reemplaza el par de tokens completo.</summary>
    public void UpdateTokens(long meliUserId, string nickname, string siteId,
        string accessTokenEnc, string refreshTokenEnc, DateTime tokenExpiresAtUtc)
    {
        MeliUserId = meliUserId;
        if (!string.IsNullOrWhiteSpace(nickname)) Nickname = nickname.Trim();
        if (!string.IsNullOrWhiteSpace(siteId)) SiteId = siteId.Trim().ToUpperInvariant();
        AccessTokenEnc = accessTokenEnc;
        RefreshTokenEnc = refreshTokenEnc;
        TokenExpiresAtUtc = tokenExpiresAtUtc;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void SetStockSync(bool enabled)
    {
        StockSyncEnabled = enabled;
        UpdatedAtUtc = DateTime.UtcNow;
    }
}
