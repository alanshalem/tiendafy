using System.Security.Claims;
using Identity.Infrastructure;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Caching.Memory;

namespace Api.Auth;

/// <summary>Con qué se probó el segundo factor.</summary>
public enum SecondFactor
{
    None,
    AuthenticatorCode,
    RecoveryCode,
}

/// <summary>
/// La verificación en dos pasos del panel (TOTP con una app de autenticación,
/// sobre la infraestructura de ASP.NET Identity). Acá vive lo que comparten el
/// login y la pantalla "Mi cuenta": validar un código sin que se pueda reusar,
/// canjear un código de recuperación y armar la clave y el QR para la app.
/// </summary>
public sealed class PanelTwoFactor(UserManager<AppUser> users, IMemoryCache cache)
{
    /// <summary>Lo que muestra la app de autenticación arriba de la cuenta.</summary>
    public const string Issuer = "Tiendafy";

    /// <summary>Cuántos códigos de recuperación se entregan.</summary>
    public const int RecoveryCodeCount = 10;

    /// <summary>
    /// Identity acepta el código de los 30 s anteriores y posteriores (dos
    /// pasos para cada lado): un código usado se recuerda un rato más que eso.
    /// </summary>
    private static readonly TimeSpan UsedCodeMemory = TimeSpan.FromMinutes(5);

    /// <summary>
    /// La identidad de la cookie intermedia (contraseña ya validada, falta el
    /// código). Es la que lee <c>SignInManager.GetTwoFactorAuthenticationUserAsync</c>:
    /// el id del usuario en <see cref="ClaimTypes.Name"/>.
    /// </summary>
    public static ClaimsPrincipal PendingPrincipal(AppUser user) =>
        new(new ClaimsIdentity([new Claim(ClaimTypes.Name, user.Id.ToString())], IdentityConstants.TwoFactorUserIdScheme));

    /// <summary>Lo que tipeó la persona, sin espacios ni guiones.</summary>
    public static string Clean(string? code) =>
        new([.. (code ?? string.Empty).Where(c => !char.IsWhiteSpace(c) && c != '-')]);

    /// <summary>Un código de la app: 6 dígitos. Lo demás se prueba como código de recuperación.</summary>
    public static bool IsAuthenticatorCode(string cleaned) => cleaned.Length == 6 && cleaned.All(char.IsAsciiDigit);

    /// <summary>
    /// Valida un código de la app. Un código ya aceptado no vuelve a servir
    /// mientras siga dentro de la ventana de validez: quien lo vio por encima
    /// del hombro no puede usarlo después.
    /// </summary>
    public async Task<bool> VerifyAuthenticatorCodeAsync(AppUser user, string? code)
    {
        var cleaned = Clean(code);
        if (!IsAuthenticatorCode(cleaned)) return false;

        var usedKey = $"panel-2fa-used:{user.Id}:{cleaned}";
        if (cache.TryGetValue(usedKey, out _)) return false;
        if (!await users.VerifyTwoFactorTokenAsync(user, users.Options.Tokens.AuthenticatorTokenProvider, cleaned))
            return false;

        cache.Set(usedKey, true, UsedCodeMemory);
        return true;
    }

    /// <summary>
    /// Prueba un código de la app o uno de recuperación (que se gasta al
    /// usarlo). No cuenta intentos fallidos: eso lo decide quien llama.
    /// </summary>
    public async Task<SecondFactor> VerifyAsync(AppUser user, string? code)
    {
        var cleaned = Clean(code);
        if (cleaned.Length == 0) return SecondFactor.None;
        if (IsAuthenticatorCode(cleaned))
            return await VerifyAuthenticatorCodeAsync(user, cleaned) ? SecondFactor.AuthenticatorCode : SecondFactor.None;
        var redeemed = await users.RedeemTwoFactorRecoveryCodeAsync(user, cleaned);
        return redeemed.Succeeded ? SecondFactor.RecoveryCode : SecondFactor.None;
    }

    /// <summary>La clave en grupos de 4, en minúsculas: más fácil de tipear a mano.</summary>
    public static string FormatKey(string key) =>
        string.Join(' ', key.ToLowerInvariant().Chunk(4).Select(c => new string(c)));

    /// <summary>El link <c>otpauth://</c> que lee la app (lo mismo que dice el QR).</summary>
    public static string AuthenticatorUri(string email, string key) =>
        $"otpauth://totp/{Uri.EscapeDataString(Issuer)}:{Uri.EscapeDataString(email)}" +
        $"?secret={key}&issuer={Uri.EscapeDataString(Issuer)}&digits=6";
}
