using Microsoft.AspNetCore.DataProtection;

namespace Api.Ai;

/// <summary>Cifra y descifra las claves de los proveedores de IA de cada tienda.</summary>
public interface IAiKeyProtector
{
    string Protect(string key);

    /// <summary>Lanza <see cref="System.Security.Cryptography.CryptographicException"/> si no se puede descifrar.</summary>
    string Unprotect(string encrypted);
}

/// <summary>
/// Singleton sin estado propio. El purpose NUNCA se cambia: todo lo cifrado con el
/// anterior dejaría de poder leerse (regla de <c>AGENTS.md</c>).
/// </summary>
public sealed class AiKeyProtector(IDataProtectionProvider dataProtection) : IAiKeyProtector
{
    public const string Purpose = "Tiendafy.Ai.Keys.v1";

    private readonly IDataProtector _protector = dataProtection.CreateProtector(Purpose);

    public string Protect(string key) => _protector.Protect(key);

    public string Unprotect(string encrypted) => _protector.Unprotect(encrypted);
}
