using System.Buffers.Binary;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
using Identity.Infrastructure;
using Microsoft.AspNetCore.DataProtection;
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
public sealed class PanelTwoFactor(UserManager<AppUser> users, IMemoryCache cache, IDataProtectionProvider dataProtection)
{
    /// <summary>
    /// Purpose del ticket de "pasar a otra app" (la clave nueva, mientras no se
    /// confirma). NUNCA cambiarlo: los tickets en curso dejarían de leerse.
    /// </summary>
    public const string RelinkTicketPurpose = "Tiendafy.Identity.AuthenticatorRelink.v1";

    /// <summary>Cuánto dura el ticket de pasar a otra app.</summary>
    public static readonly TimeSpan RelinkTicketLifetime = TimeSpan.FromMinutes(15);

    /// <summary>
    /// Cuánto dura el paso intermedio de quien tiene que configurarla para
    /// entrar: más que los 5 minutos del código, porque puede tener que
    /// instalar la app.
    /// </summary>
    public static readonly TimeSpan SetupStepLifetime = TimeSpan.FromMinutes(15);

    /// <summary>Marca del paso intermedio que solo sirve para configurarla (no para el código).</summary>
    private const string SetupClaim = "tiendafy:2fa-setup";

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

    /// <summary>
    /// La identidad del paso intermedio de quien pasó la contraseña pero tiene
    /// que configurar la verificación para entrar. Es la misma cookie que la
    /// del código, con una marca: solo la aceptan los endpoints de configurarla.
    /// </summary>
    public static ClaimsPrincipal PendingSetupPrincipal(AppUser user) =>
        new(new ClaimsIdentity(
            [new Claim(ClaimTypes.Name, user.Id.ToString()), new Claim(SetupClaim, "1")],
            IdentityConstants.TwoFactorUserIdScheme));

    /// <summary>El id de la persona si el principal es el paso intermedio de configurarla.</summary>
    public static Guid? SetupUserId(ClaimsPrincipal? principal) =>
        principal is not null && principal.HasClaim(SetupClaim, "1")
            && Guid.TryParse(principal.FindFirstValue(ClaimTypes.Name), out var id)
            ? id
            : null;

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

    /// <summary>
    /// Pasar a otra app: una clave nueva que NO se guarda hasta confirmarla con
    /// un código de la app nueva. Mientras tanto viaja cifrada en un ticket de
    /// vida corta, atado a la persona: si no la confirma, sigue valiendo la
    /// app de antes y no queda nada a medio hacer en la base.
    /// </summary>
    public (string Key, string Ticket) StartRelink(AppUser user)
    {
        var key = users.GenerateNewAuthenticatorKey();
        var payload = JsonSerializer.Serialize(new RelinkTicket(user.Id, key));
        return (key, RelinkProtector().Protect(payload, RelinkTicketLifetime));
    }

    /// <summary>La clave nueva del ticket, si es de esta persona y no venció.</summary>
    public string? ReadRelinkTicket(AppUser user, string? ticket)
    {
        if (string.IsNullOrWhiteSpace(ticket)) return null;
        try
        {
            var data = JsonSerializer.Deserialize<RelinkTicket>(RelinkProtector().Unprotect(ticket));
            return data is not null && data.UserId == user.Id ? data.Key : null;
        }
        catch (Exception e) when (e is CryptographicException or JsonException or FormatException)
        {
            return null;
        }
    }

    /// <summary>
    /// Valida un código contra una clave que todavía no está guardada (la de
    /// pasar a otra app), con la misma ventana que Identity (dos pasos de 30 s
    /// para cada lado) y el mismo freno contra reusar un código.
    /// </summary>
    public bool VerifyCodeForKey(AppUser user, string key, string? code)
    {
        var cleaned = Clean(code);
        if (!IsAuthenticatorCode(cleaned)) return false;
        var usedKey = $"panel-2fa-used:{user.Id}:{cleaned}";
        if (cache.TryGetValue(usedKey, out _)) return false;

        var secret = FromBase32(key);
        if (secret is null) return false;
        var expected = int.Parse(cleaned, System.Globalization.CultureInfo.InvariantCulture);
        var step = DateTimeOffset.UtcNow.ToUnixTimeSeconds() / 30;
        for (var offset = -2; offset <= 2; offset++)
        {
            if (Totp(secret, step + offset) != expected) continue;
            cache.Set(usedKey, true, UsedCodeMemory);
            return true;
        }
        return false;
    }

    private ITimeLimitedDataProtector RelinkProtector() =>
        dataProtection.CreateProtector(RelinkTicketPurpose).ToTimeLimitedDataProtector();

    private sealed record RelinkTicket(Guid UserId, string Key);

    /// <summary>TOTP (RFC 6238) con HMAC-SHA1 y 6 dígitos: lo que calcula la app.</summary>
    private static int Totp(byte[] secret, long step)
    {
        Span<byte> counter = stackalloc byte[8];
        BinaryPrimitives.WriteInt64BigEndian(counter, step);
#pragma warning disable CA5350 // TOTP es HMAC-SHA1: es lo que calculan las apps de autenticación
        var hash = HMACSHA1.HashData(secret, counter);
#pragma warning restore CA5350
        var offset = hash[^1] & 0x0f;
        var binary = ((hash[offset] & 0x7f) << 24) | (hash[offset + 1] << 16) | (hash[offset + 2] << 8) | hash[offset + 3];
        return binary % 1_000_000;
    }

    private static byte[]? FromBase32(string input)
    {
        const string alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        var bytes = new List<byte>();
        int buffer = 0, bits = 0;
        foreach (var c in input.TrimEnd('=').ToUpperInvariant())
        {
            var value = alphabet.IndexOf(c, StringComparison.Ordinal);
            if (value < 0) return null;
            buffer = ((buffer << 5) | value) & 0xFFFF; // alcanzan los bits que faltan leer
            bits += 5;
            if (bits >= 8)
            {
                bytes.Add((byte)(buffer >> (bits - 8)));
                bits -= 8;
            }
        }
        return [.. bytes];
    }

    /// <summary>La clave en grupos de 4, en minúsculas: más fácil de tipear a mano.</summary>
    public static string FormatKey(string key) =>
        string.Join(' ', key.ToLowerInvariant().Chunk(4).Select(c => new string(c)));

    /// <summary>El link <c>otpauth://</c> que lee la app (lo mismo que dice el QR).</summary>
    public static string AuthenticatorUri(string email, string key) =>
        $"otpauth://totp/{Uri.EscapeDataString(Issuer)}:{Uri.EscapeDataString(email)}" +
        $"?secret={key}&issuer={Uri.EscapeDataString(Issuer)}&digits=6";
}
