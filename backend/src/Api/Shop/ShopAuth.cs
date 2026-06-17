using System.Security.Cryptography;
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

    public static string NewToken()
    {
        Span<byte> bytes = stackalloc byte[32];
        RandomNumberGenerator.Fill(bytes);
        return Convert.ToBase64String(bytes).Replace('+', '-').Replace('/', '_').TrimEnd('=');
    }

    /// <summary>Lee `Authorization: Bearer &lt;token&gt;` y resuelve el comprador. Null si inválido/expirado.</summary>
    public static async Task<Customer?> ResolveAsync(HttpContext http, CustomersDbContext db, CancellationToken ct)
    {
        var header = http.Request.Headers.Authorization.ToString();
        if (string.IsNullOrEmpty(header) || !header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            return null;
        var token = header["Bearer ".Length..].Trim();
        if (token.Length == 0) return null;

        var session = await db.CustomerSessions.AsNoTracking().FirstOrDefaultAsync(s => s.Token == token, ct);
        if (session is null || session.IsExpired) return null;

        return await db.Customers.FirstOrDefaultAsync(c => c.Id == session.CustomerId, ct);
    }
}

public sealed record ShopRegisterRequest(string Name, string Email, string Password);
public sealed record ShopLoginRequest(string Email, string Password);
