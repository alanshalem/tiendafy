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

    /// <summary>
    /// El token de la sesión y si vino en la cookie (la que el navegador manda
    /// solo, desde cualquier página) o en el header Bearer (que un script de
    /// otra página no tiene).
    /// </summary>
    private static (string? Token, bool FromCookie) ReadToken(HttpContext http)
    {
        // 1) Cookie por-tenant (preferida). 2) Bearer (clientes sin cookie / compat).
        if (http.Request.Headers.TryGetValue("X-Tenant-Id", out var rawTenant)
            && Guid.TryParse(rawTenant.ToString(), out var tid)
            && http.Request.Cookies.TryGetValue(CookieName(tid), out var cookieToken)
            && !string.IsNullOrEmpty(cookieToken))
            return (cookieToken, true);

        var header = http.Request.Headers.Authorization.ToString();
        if (header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            var t = header["Bearer ".Length..].Trim();
            return (t.Length == 0 ? null : t, false);
        }
        return (null, false);
    }

    /// <summary>
    /// La cookie de la tienda vale solo desde un host de esa tienda o sin
    /// <c>Origin</c> (<see cref="StoreOrigins.AllowsSessionAsync"/>). La cookie
    /// es del host de la API y viaja desde cualquier tienda de la plataforma:
    /// sin esto, un script en la tienda A mandaba <c>X-Tenant-Id</c> de la B y
    /// actuaba como el comprador de la B que la visitaba.
    /// </summary>
    private static Task<bool> CookieAllowedAsync(HttpContext http, Guid tenantId, CancellationToken ct) =>
        http.RequestServices.GetRequiredService<StoreOrigins>().AllowsSessionAsync(http.Request, tenantId, ct);

    /// <summary>Cierra la sesión actual: borra la sesión del token y limpia la cookie.</summary>
    public static async Task LogoutAsync(HttpContext http, CustomersDbContext db, CancellationToken ct)
    {
        var hasTenant = http.Request.Headers.TryGetValue("X-Tenant-Id", out var rt) && Guid.TryParse(rt.ToString(), out _);
        var tid = hasTenant ? Guid.Parse(rt.ToString()) : Guid.Empty;
        // Desde otra tienda (u otro sitio) no se cierra nada: ni la sesión ni la cookie.
        if (hasTenant && !await CookieAllowedAsync(http, tid, ct)) return;

        var (token, _) = ReadToken(http);
        if (!string.IsNullOrEmpty(token))
        {
            var hash = ShopperTokenHash.Of(token);
            var session = await db.CustomerSessions.AsNoTracking().FirstOrDefaultAsync(s => s.TokenHash == hash, ct);
            await db.CustomerSessions.Where(s => s.TokenHash == hash).ExecuteDeleteAsync(ct);
            if (session is not null) ClearSessionCookie(http, session.TenantId);
        }
        if (hasTenant) ClearSessionCookie(http, tid);
    }

    /// <summary>Resuelve el comprador desde la cookie HttpOnly (o bearer). Null si inválido/expirado.</summary>
    public static async Task<Customer?> ResolveAsync(HttpContext http, CustomersDbContext db, CancellationToken ct)
    {
        var (token, fromCookie) = ReadToken(http);
        if (string.IsNullOrEmpty(token)) return null;

        var hash = ShopperTokenHash.Of(token);
        var session = await db.CustomerSessions.AsNoTracking().FirstOrDefaultAsync(s => s.TokenHash == hash, ct);
        if (session is null || session.IsExpired) return null;

        // La sesión queda atada a su tienda: no se puede reusar un bearer de la
        // tienda A poniendo el header X-Tenant-Id de la tienda B.
        if (http.Request.Headers.TryGetValue("X-Tenant-Id", out var rawTenant)
            && Guid.TryParse(rawTenant.ToString(), out var headerTenant)
            && headerTenant != session.TenantId)
            return null;

        if (fromCookie && !await CookieAllowedAsync(http, session.TenantId, ct)) return null;

        return await db.Customers.FirstOrDefaultAsync(c => c.Id == session.CustomerId, ct);
    }

    /// <summary>
    /// Cierra todas las sesiones del comprador. Se usa cuando cambia quién
    /// controla la cuenta (verificó el email, eligió otra contraseña, entró con
    /// Google sobre una cuenta sin verificar): una sesión abierta antes, con una
    /// contraseña que pudo poner otro, no puede pasar a ver sus compras.
    /// </summary>
    public static Task RevokeSessionsAsync(CustomersDbContext db, Guid customerId, CancellationToken ct) =>
        db.CustomerSessions.Where(s => s.CustomerId == customerId).ExecuteDeleteAsync(ct);

    /// <summary>
    /// ¿Es suyo el pedido? Los pedidos se atan a la cuenta por el email de la
    /// compra, así que solo cuenta si la cuenta probó que el email es suyo
    /// (<see cref="Customer.EmailVerified"/>): si no, cualquiera que se
    /// registre con el email de otro vería sus compras, su factura y su
    /// dirección. Todo endpoint de la tienda que vincule un pedido con el
    /// comprador logueado pasa por acá.
    /// </summary>
    public static bool OwnsOrder(Customer? customer, string? buyerEmail) =>
        customer is { EmailVerified: true }
        && NormalizeEmail(customer.Email) is { } mine
        && NormalizeEmail(buyerEmail) == mine;
}

/// <summary>
/// Registro: nombre y email. <paramref name="Password"/> se tolera (clientes
/// viejos lo mandan) pero no se usa: la contraseña se elige con el link del mail.
/// </summary>
public sealed record ShopRegisterRequest(string Name, string Email, string? Password = null, string? Captcha = null);
public sealed record ShopLoginRequest(string Email, string Password, string? Captcha = null);
public sealed record ShopForgotRequest(string Email, string? Captcha = null);
public sealed record ShopResetRequest(string Token, string Password);
/// <summary>El link de activación más la contraseña que elige quien controla el email.</summary>
public sealed record ShopVerifyRequest(string Token, string? Password = null);
