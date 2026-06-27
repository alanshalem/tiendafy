using System.Security.Cryptography;
using System.Text;
using Customers.Infrastructure;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Api.Shop;

/// <summary>
/// Auth de comprador (shopper): hashing de password + sesiones por token opaco.
/// Separado del Identity del staff (cookie). Multi-tenant: la sesión guarda el
/// tenant y los endpoints validan que coincida con el de la request.
/// </summary>
public static class ShopAuth
{
    private static readonly PasswordHasher<Customer> Hasher = new();
    public static readonly TimeSpan SessionLifetime = TimeSpan.FromDays(30);

    public static string HashPassword(Customer c, string password) => Hasher.HashPassword(c, password);

    public static bool VerifyPassword(Customer c, string password)
    {
        if (string.IsNullOrEmpty(c.PasswordHash)) return false;
        var r = Hasher.VerifyHashedPassword(c, c.PasswordHash, password);
        return r is PasswordVerificationResult.Success or PasswordVerificationResult.SuccessRehashNeeded;
    }

    private static readonly string DummyHash = Hasher.HashPassword(null!, "burn-the-clock");

    /// <summary>Hash "dummy" para igualar el tiempo cuando el email no existe (anti enumeración por timing).</summary>
    public static void BurnPassword(string password) => Hasher.VerifyHashedPassword(null!, DummyHash, password ?? string.Empty);

    /// <summary>Normaliza email (NFKC + minúsculas) para evitar colisiones por Unicode/case.</summary>
    public static string? NormalizeEmail(string? email) =>
        string.IsNullOrWhiteSpace(email) ? null : email.Trim().Normalize(NormalizationForm.FormKC).ToLowerInvariant();

    public static string NewToken()
    {
        Span<byte> bytes = stackalloc byte[32];
        RandomNumberGenerator.Fill(bytes);
        return Convert.ToBase64String(bytes).Replace('+', '-').Replace('/', '_').TrimEnd('=');
    }

    // --- Sesión en cookie HttpOnly (no accesible por JS → inmune a robo por XSS). ---
    // Nombre por-tenant: el comprador puede estar logueado en varias tiendas a la vez.
    private static string CookieName(Guid tid) => $"shop_{tid:N}";

    public static void SetSessionCookie(HttpContext http, Guid tid, string token) =>
        http.Response.Cookies.Append(CookieName(tid), token, new CookieOptions
        {
            HttpOnly = true,
            Secure = http.Request.IsHttps,                  // en dev (http localhost) no exige TLS
            SameSite = SameSiteMode.Lax,                    // api y tienda comparten dominio registrable
            Path = "/",
            IsEssential = true,
            Expires = DateTimeOffset.UtcNow.Add(SessionLifetime),
        });

    public static void ClearSessionCookie(HttpContext http, Guid tid) =>
        http.Response.Cookies.Delete(CookieName(tid), new CookieOptions { Path = "/" });

    private static string? ReadToken(HttpContext http)
    {
        // 1) Cookie por-tenant (preferida). 2) Bearer (clientes sin cookie / compat).
        if (http.Request.Headers.TryGetValue("X-Tenant-Id", out var rawTenant)
            && Guid.TryParse(rawTenant.ToString(), out var tid)
            && http.Request.Cookies.TryGetValue(CookieName(tid), out var cookieToken)
            && !string.IsNullOrEmpty(cookieToken))
            return cookieToken;

        var header = http.Request.Headers.Authorization.ToString();
        if (header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            var t = header["Bearer ".Length..].Trim();
            return t.Length == 0 ? null : t;
        }
        return null;
    }

    /// <summary>Cierra la sesión actual: borra la sesión del token y limpia la cookie.</summary>
    public static async Task LogoutAsync(HttpContext http, CustomersDbContext db, CancellationToken ct)
    {
        var token = ReadToken(http);
        if (!string.IsNullOrEmpty(token))
        {
            var session = await db.CustomerSessions.AsNoTracking().FirstOrDefaultAsync(s => s.Token == token, ct);
            await db.CustomerSessions.Where(s => s.Token == token).ExecuteDeleteAsync(ct);
            if (session is not null) ClearSessionCookie(http, session.TenantId);
        }
        if (http.Request.Headers.TryGetValue("X-Tenant-Id", out var rt) && Guid.TryParse(rt.ToString(), out var tid))
            ClearSessionCookie(http, tid);
    }

    /// <summary>Resuelve el comprador desde la cookie HttpOnly (o bearer). Null si inválido/expirado.</summary>
    public static async Task<Customer?> ResolveAsync(HttpContext http, CustomersDbContext db, CancellationToken ct)
    {
        var token = ReadToken(http);
        if (string.IsNullOrEmpty(token)) return null;

        var session = await db.CustomerSessions.AsNoTracking().FirstOrDefaultAsync(s => s.Token == token, ct);
        if (session is null || session.IsExpired) return null;

        // La sesión queda atada a su tienda: no se puede reusar un bearer de la
        // tienda A poniendo el header X-Tenant-Id de la tienda B.
        if (http.Request.Headers.TryGetValue("X-Tenant-Id", out var rawTenant)
            && Guid.TryParse(rawTenant.ToString(), out var headerTenant)
            && headerTenant != session.TenantId)
            return null;

        return await db.Customers.FirstOrDefaultAsync(c => c.Id == session.CustomerId, ct);
    }
}

public sealed record ShopRegisterRequest(string Name, string Email, string Password, string? Captcha = null);
public sealed record ShopLoginRequest(string Email, string Password, string? Captcha = null);
public sealed record ShopForgotRequest(string Email);
public sealed record ShopResetRequest(string Token, string Password);
public sealed record ShopVerifyRequest(string Token);
