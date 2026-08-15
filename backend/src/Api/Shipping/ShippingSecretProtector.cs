using Microsoft.AspNetCore.DataProtection;

namespace Api.Shipping;

/// <summary>
/// Cifra/descifra los secretos de TODOS los carriers (MiCorreo, Zipnova) y del
/// checkout. Nació como "CorreoSecretProtector" y por eso el purpose dice
/// "correo": NO CAMBIAR NUNCA el string del purpose — invalidaría todos los
/// secretos de tiendas ya cifrados en producción.
/// </summary>
public sealed class ShippingSecretProtector(IDataProtectionProvider provider)
{
    private readonly IDataProtector _protector = provider.CreateProtector("tiendafy.correo.tokens");
    public string Protect(string plain) => _protector.Protect(plain);
    public string Unprotect(string cipher) => _protector.Unprotect(cipher);
}
