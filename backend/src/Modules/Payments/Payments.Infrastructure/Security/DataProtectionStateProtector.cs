using Microsoft.AspNetCore.DataProtection;
using Payments.Core.Abstractions;
using SharedKernel.Common;

namespace Payments.Infrastructure.Security;

/// <summary>
/// Firma el <c>state</c> OAuth con tenant + timestamp (cifrado). El callback
/// recupera el tenant sin confiar en headers (anti-CSRF) y rechaza states
/// más viejos que 15 min.
/// </summary>
public sealed class DataProtectionStateProtector(IDataProtectionProvider provider) : IOAuthStateProtector
{
    private static readonly TimeSpan MaxAge = TimeSpan.FromMinutes(15);
    private readonly IDataProtector _protector = provider.CreateProtector("Tiendafy.Payments.MercadoPagoOAuthState.v1");

    public string Protect(TenantId tenantId) =>
        _protector.Protect($"{tenantId.Value:N}|{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}");

    public TenantId? TryUnprotect(string state)
    {
        try
        {
            var parts = _protector.Unprotect(state).Split('|');
            if (parts.Length != 2) return null;

            var issuedAt = DateTimeOffset.FromUnixTimeSeconds(long.Parse(parts[1]));
            if (DateTimeOffset.UtcNow - issuedAt > MaxAge) return null;

            return TenantId.From(Guid.ParseExact(parts[0], "N"));
        }
        catch
        {
            return null;
        }
    }
}
