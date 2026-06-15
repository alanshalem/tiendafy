using SharedKernel.Common;

namespace Payments.Core.Abstractions;

/// <summary>Tokens devueltos por el OAuth de MercadoPago (code exchange / refresh).</summary>
public sealed record MercadoPagoTokens(
    long UserId,
    string AccessToken,
    string RefreshToken,
    string? PublicKey,
    string Scope,
    int ExpiresInSeconds);

/// <summary>Cliente OAuth de la app de plataforma contra MercadoPago.</summary>
public interface IMercadoPagoOAuthClient
{
    /// <summary>URL a la que mandamos al merchant para que autorice ("Conectá tu cuenta").</summary>
    string BuildAuthorizationUrl(string state);

    Task<MercadoPagoTokens> ExchangeCodeAsync(string code, CancellationToken ct = default);
    Task<MercadoPagoTokens> RefreshAsync(string refreshToken, CancellationToken ct = default);
}

/// <summary>Cifra/descifra secretos en reposo (Data Protection).</summary>
public interface ITokenProtector
{
    string Protect(string plaintext);
    string Unprotect(string ciphertext);
}

/// <summary>
/// Firma el parámetro <c>state</c> del OAuth con el tenant + timestamp.
/// Anti-CSRF: el callback recupera el tenant sin confiar en headers.
/// </summary>
public interface IOAuthStateProtector
{
    string Protect(TenantId tenantId);
    TenantId? TryUnprotect(string state);
}
