using System.Security.Cryptography;
using System.Text;
using Identity.Infrastructure.Persistence;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;

namespace Identity.Infrastructure;

/// <summary>
/// El store de Identity con los secretos del segundo factor protegidos en la
/// base. El de fábrica guarda en <c>user_tokens</c> la clave del autenticador
/// y los códigos de recuperación en texto plano: con una copia de la base
/// alcanzaba para generar códigos válidos de cualquiera.
///
/// <list type="bullet">
/// <item>La clave del autenticador va cifrada con DataProtection (hay que
/// poder leerla para validar cada código). Sin poder descifrarla, la cuenta
/// sigue entrando con sus códigos de recuperación.</item>
/// <item>Los códigos de recuperación van como hash SHA-256: solo hace falta
/// compararlos, y son al azar (no hace falta un hash lento).</item>
/// </list>
/// </summary>
public sealed class AppUserStore(
    AppIdentityDbContext context,
    IDataProtectionProvider dataProtection,
    IdentityErrorDescriber? describer = null)
    : UserStore<AppUser, IdentityRole<Guid>, AppIdentityDbContext, Guid>(context, describer)
{
    /// <summary>Purpose de la clave del autenticador. NUNCA cambiarlo: lo cifrado con el viejo deja de poder leerse.</summary>
    public const string AuthenticatorKeyPurpose = "Tiendafy.Identity.AuthenticatorKey.v1";

    // Los mismos nombres que usa Identity (son privados en UserStoreBase).
    private const string InternalLoginProvider = "[AspNetUserStore]";
    private const string AuthenticatorKeyTokenName = "AuthenticatorKey";
    private const string RecoveryCodeTokenName = "RecoveryCodes";

    private readonly IDataProtector _protector = dataProtection.CreateProtector(AuthenticatorKeyPurpose);

    public override Task SetAuthenticatorKeyAsync(AppUser user, string key, CancellationToken cancellationToken) =>
        SetTokenAsync(user, InternalLoginProvider, AuthenticatorKeyTokenName, _protector.Protect(key), cancellationToken);

    public override async Task<string?> GetAuthenticatorKeyAsync(AppUser user, CancellationToken cancellationToken)
    {
        var stored = await GetTokenAsync(user, InternalLoginProvider, AuthenticatorKeyTokenName, cancellationToken);
        if (string.IsNullOrEmpty(stored)) return null;
        try
        {
            return _protector.Unprotect(stored);
        }
        catch (CryptographicException)
        {
            return null; // claves de DataProtection perdidas: el código no valida, los de recuperación sí
        }
    }

    public override Task ReplaceCodesAsync(AppUser user, IEnumerable<string> recoveryCodes, CancellationToken cancellationToken) =>
        SetTokenAsync(user, InternalLoginProvider, RecoveryCodeTokenName,
            string.Join(";", recoveryCodes.Select(HashRecoveryCode)), cancellationToken);

    public override async Task<bool> RedeemCodeAsync(AppUser user, string code, CancellationToken cancellationToken)
    {
        var hashes = await StoredHashesAsync(user, cancellationToken);
        var hash = HashRecoveryCode(code);
        if (!hashes.Remove(hash)) return false;
        await SetTokenAsync(user, InternalLoginProvider, RecoveryCodeTokenName, string.Join(";", hashes), cancellationToken);
        return true;
    }

    public override async Task<int> CountCodesAsync(AppUser user, CancellationToken cancellationToken) =>
        (await StoredHashesAsync(user, cancellationToken)).Count;

    private async Task<List<string>> StoredHashesAsync(AppUser user, CancellationToken ct)
    {
        var stored = await GetTokenAsync(user, InternalLoginProvider, RecoveryCodeTokenName, ct);
        return string.IsNullOrEmpty(stored) ? [] : [.. stored.Split(';', StringSplitOptions.RemoveEmptyEntries)];
    }

    /// <summary>
    /// Hash de un código de recuperación. Se ignoran espacios, guiones y
    /// mayúsculas: "abcde-12345" y "ABCDE12345" son el mismo código.
    /// </summary>
    internal static string HashRecoveryCode(string code)
    {
        var normalized = new string([.. code.Where(char.IsLetterOrDigit)]).ToUpperInvariant();
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(normalized)));
    }
}
