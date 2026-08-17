using Microsoft.AspNetCore.DataProtection;
using SharedKernel.Common;

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
        _protector.Protect(TimestampedId.Format(tenantId));

    public Guid? TryUnprotect(string state)
    {
        try
        {
            return TimestampedId.TryParse(_protector.Unprotect(state), MaxAge);
        }
        catch
        {
            return null;
        }
    }
}
