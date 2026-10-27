using System.Text;
using Microsoft.AspNetCore.Identity;

namespace Identity.Infrastructure;

/// <summary>
/// La clave con la que Identity busca a alguien del panel por email o usuario:
/// NFKC + mayúsculas invariantes. El de fábrica solo pasaba a mayúsculas, así
/// que una "é" compuesta y una "e" + tilde combinante (o letras de ancho
/// completo) eran claves distintas para la misma dirección. Los compradores ya
/// se normalizan con NFKC (<c>ShopAuth.NormalizeEmail</c>, en minúsculas).
///
/// <para>
/// Para ASCII da exactamente lo mismo que antes. Las cuentas guardadas con la
/// clave vieja las sigue encontrando <see cref="AppUserManager"/>, que las
/// re-normaliza la primera vez que las encuentra.
/// </para>
/// </summary>
public sealed class PanelLookupNormalizer : ILookupNormalizer
{
    public string? NormalizeName(string? name) => Normalize(name);

    public string? NormalizeEmail(string? email) => Normalize(email);

    private static string? Normalize(string? value) =>
        value?.Normalize(NormalizationForm.FormKC).ToUpperInvariant();

    /// <summary>La clave de antes (solo mayúsculas), para encontrar cuentas viejas.</summary>
    public static string? LegacyNormalize(string? value) => value?.ToUpperInvariant();
}
