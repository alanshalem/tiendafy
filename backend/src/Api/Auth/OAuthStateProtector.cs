using Microsoft.AspNetCore.DataProtection;

namespace Api.Auth;

/// <summary>
/// State OAuth firmado y con vencimiento: tenant + timestamp cifrados bajo el
/// purpose de cada integración. El callback recupera el tenant sin confiar en
/// headers (anti-CSRF) y rechaza states más viejos que 15 minutos. Lógica
/// única (antes copiada en Payments y Meli); el purpose se preserva por
/// integración, así los states en vuelo siguen siendo válidos.
/// </summary>
public sealed class OAuthStateProtector(IDataProtectionProvider provider, string purpose)
{
    private static readonly TimeSpan MaxAge = TimeSpan.FromMinutes(15);
    private readonly IDataProtector _protector = provider.CreateProtector(purpose);

    public string Protect(Guid tenantId) =>
        _protector.Protect($"{tenantId:N}|{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}");

    public Guid? TryUnprotect(string state)
    {
        try
        {
            var parts = _protector.Unprotect(state).Split('|');
            if (parts.Length != 2) return null;
            var issuedAt = DateTimeOffset.FromUnixTimeSeconds(long.Parse(parts[1]));
            if (DateTimeOffset.UtcNow - issuedAt > MaxAge) return null;
            return Guid.ParseExact(parts[0], "N");
        }
        catch
        {
            return null;
        }
    }
}
