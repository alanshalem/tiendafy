using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;

namespace Api.Shipping;

/// <summary>
/// Motor común de los quote tokens firmados (Correo, Zipnova): serializa el
/// payload, lo firma con TTL de 30 minutos bajo el purpose del carrier y al
/// desproteger valida vencimiento y tenant. El precio cotizado nunca viaja
/// suelto desde el cliente. Cada carrier conserva su purpose original — los
/// tokens ya emitidos siguen siendo válidos.
/// </summary>
public static class SignedQuoteToken
{
    private static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(30);

    public static string Protect<T>(IDataProtectionProvider dp, string purpose, T payload) =>
        dp.CreateProtector(purpose).ToTimeLimitedDataProtector()
            .Protect(JsonSerializer.Serialize(payload), Lifetime);

    /// <summary>null si el token es inválido, vencido o de otro tenant.</summary>
    public static T? Unprotect<T>(
        IDataProtectionProvider dp, string purpose, string token, Guid tenantId, Func<T, Guid> tenantOf)
        where T : class
    {
        try
        {
            var raw = dp.CreateProtector(purpose).ToTimeLimitedDataProtector().Unprotect(token);
            var payload = JsonSerializer.Deserialize<T>(raw);
            return payload is null || tenantOf(payload) != tenantId ? null : payload;
        }
        catch (Exception)
        {
            return null;
        }
    }
}
