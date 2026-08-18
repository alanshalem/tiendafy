using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;
using SharedKernel.Common;

namespace Api.Social;

/// <summary>
/// Cifrado de tokens de cuentas sociales + state OAuth con payload JSON
/// (tenant, verifier PKCE de X, expiración). Purposes NUEVOS — jamás cambiarlos.
/// </summary>
public sealed class SocialTokenService(IDataProtectionProvider dataProtection)
{
    private sealed record StatePayload(Guid TenantId, string? Verifier, DateTime ExpiresAtUtc);

    private readonly IDataProtector _tokens = dataProtection.CreateProtector("Tiendafy.Social.Tokens.v1");
    private readonly IDataProtector _state = dataProtection.CreateProtector("Tiendafy.Social.OAuthState.v1");

    public string Protect(string tokenJson) => _tokens.Protect(tokenJson);

    public string Unprotect(string encrypted) => _tokens.Unprotect(encrypted);

    /// <summary>State cifrado con tenant (+ verifier PKCE si la red lo usa); vence a los 15 minutos.</summary>
    public string ProtectState(Guid tenantId, string? verifier = null) =>
        _state.Protect(JsonSerializer.Serialize(new StatePayload(tenantId, verifier, DateTime.UtcNow.AddMinutes(15))));

    public (Guid TenantId, string? Verifier)? TryUnprotectState(string state)
    {
        try
        {
            var payload = JsonSerializer.Deserialize<StatePayload>(_state.Unprotect(state));
            if (payload is null || payload.ExpiresAtUtc < DateTime.UtcNow) return null;
            return (payload.TenantId, payload.Verifier);
        }
        catch
        {
            return null;
        }
    }

    /// <summary>Descifra el token de una cuenta con tolerancia (claves rotadas ⇒ null = reconectar).</summary>
    public string? TryUnprotect(string encrypted)
    {
        try { return _tokens.Unprotect(encrypted); }
        catch { return null; }
    }

    /// <summary>Lector chico de campos del token JSON (evita DTOs por red).</summary>
    public static string? TokenField(string tokenJson, string field)
    {
        using var doc = JsonDocument.Parse(tokenJson);
        return JsonRead.GetString(doc.RootElement, field);
    }
}
