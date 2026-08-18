using Analytics.Infrastructure;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

namespace Api.MetaAds;

/// <summary>
/// Token de Meta Ads por tienda: cifrado DataProtection + state OAuth firmado.
/// El token largo de Meta (~60 días) no tiene refresh: al vencer, el panel
/// pide reconectar.
/// </summary>
public sealed class MetaAdsTokenService(AnalyticsDbContext db, IDataProtectionProvider dataProtection)
{
    private readonly IDataProtector _tokens = dataProtection.CreateProtector("Tiendafy.MetaAds.Tokens.v1");
    private readonly Auth.OAuthStateProtector _state = new(dataProtection, "Tiendafy.MetaAds.OAuthState.v1");

    public string Protect(string plaintext) => _tokens.Protect(plaintext);

    public string ProtectState(Guid tenantId) => _state.Protect(tenantId);

    public Guid? TryUnprotectState(string state) => _state.TryUnprotect(state);

    /// <summary>Conexión + token en claro, o null si no hay conexión vigente.</summary>
    public async Task<(MetaAdsConnection Connection, string AccessToken)?> GetConnectionAsync(Guid tenantId, CancellationToken ct)
    {
        var c = await db.MetaAdsConnections.IgnoreQueryFilters()
            .FirstOrDefaultAsync(x => x.TenantId == tenantId, ct);
        if (c is null) return null;
        if (c.TokenExpiresAtUtc is { } exp && exp <= DateTime.UtcNow) return null;
        try
        {
            return (c, _tokens.Unprotect(c.AccessTokenEncrypted));
        }
        catch
        {
            return null; // claves de DataProtection rotadas/perdidas → reconectar
        }
    }
}
