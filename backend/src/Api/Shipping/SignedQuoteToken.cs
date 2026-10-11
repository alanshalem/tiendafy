using Api.Auth;
using Microsoft.AspNetCore.DataProtection;

namespace Api.Shipping;

/// <summary>
/// Motor común de los quote tokens firmados (Correo, Zipnova, Andreani): el
/// payload viaja firmado, con TTL de 30 minutos bajo el purpose del carrier, y
/// al desproteger se valida vencimiento y tenant. El precio cotizado nunca
/// viaja suelto desde el cliente. Cada carrier conserva su purpose original —
/// los tokens ya emitidos siguen siendo válidos—. La firma la hace SignedToken.
/// </summary>
public static class SignedQuoteToken
{
    private static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(30);

    public static string Protect<T>(IDataProtectionProvider dp, string purpose, T payload) where T : class =>
        new SignedToken<T>(purpose, Lifetime).Protect(dp, payload);

    /// <summary>null si el token es inválido, vencido o de otro tenant.</summary>
    public static T? Unprotect<T>(
        IDataProtectionProvider dp, string purpose, string token, Guid tenantId, Func<T, Guid> tenantOf)
        where T : class =>
        new SignedToken<T>(purpose, Lifetime).Unprotect(dp, token, p => tenantOf(p) == tenantId);
}
