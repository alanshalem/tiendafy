using System.Security.Cryptography;
using System.Text;

namespace Customers.Infrastructure;

/// <summary>
/// Lo que se guarda de un token del comprador (sesión, reset, verificación):
/// su SHA-256 en hex, nunca el token. Quien lea la base (un backup filtrado,
/// una consulta de más) no se lleva sesiones abiertas ni links de reset que
/// sirvan. Sin sal: los tokens son 32 bytes aleatorios, no hay diccionario
/// que probar. La migración HashShopperTokens convirtió los que había con la
/// misma cuenta en SQL (<c>encode(sha256(convert_to(token, 'UTF8')), 'hex')</c>),
/// así que los dos lados tienen que dar lo mismo: UTF-8 y hex en minúsculas.
/// </summary>
public static class ShopperTokenHash
{
    public static string Of(string token) =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}
