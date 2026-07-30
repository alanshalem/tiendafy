using System.Collections.Concurrent;
using MercadoLibre.Infrastructure;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

namespace Api.Meli;

/// <summary>
/// Tokens de Mercado Libre por tienda. Dos responsabilidades:
/// - Cifrado (DataProtection) de access/refresh tokens — nunca en claro en DB.
/// - Renovación SERIALIZADA por tenant: el refresh token de ML es de un solo
///   uso; dos refreshes concurrentes invalidarían la conexión entera. El
///   semáforo por tenant + re-lectura dentro del lock lo evitan.
/// </summary>
public sealed class MeliTokenService(
    MeliDbContext db, MeliClient client,
    IDataProtectionProvider dataProtection, ILogger<MeliTokenService> logger)
{
    /// <summary>Renovar con margen: nunca usar un token a segundos de vencer.</summary>
    private static readonly TimeSpan ExpiryMargin = TimeSpan.FromMinutes(10);

    private static readonly ConcurrentDictionary<Guid, SemaphoreSlim> Locks = new();

    private readonly IDataProtector _tokens = dataProtection.CreateProtector("Tiendafy.Meli.Tokens.v1");
    private readonly IDataProtector _state = dataProtection.CreateProtector("Tiendafy.Meli.OAuthState.v1");

    public string Protect(string plaintext) => _tokens.Protect(plaintext);

    /// <summary>State OAuth firmado (tenant + timestamp); vence a los 15 minutos.</summary>
    public string ProtectState(Guid tenantId) =>
        _state.Protect($"{tenantId:N}|{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}");

    public Guid? TryUnprotectState(string state)
    {
        try
        {
            var parts = _state.Unprotect(state).Split('|');
            if (parts.Length != 2) return null;
            var issuedAt = DateTimeOffset.FromUnixTimeSeconds(long.Parse(parts[1]));
            if (DateTimeOffset.UtcNow - issuedAt > TimeSpan.FromMinutes(15)) return null;
            return Guid.ParseExact(parts[0], "N");
        }
        catch
        {
            return null;
        }
    }

    /// <summary>
    /// Access token vigente de la conexión, renovando si está por vencer.
    /// Devuelve null si la tienda no está conectada.
    /// </summary>
    public async Task<string?> GetValidTokenAsync(Guid tenantId, CancellationToken ct)
    {
        var connection = await db.Connections.IgnoreQueryFilters()
            .AsNoTracking().FirstOrDefaultAsync(c => c.TenantId == tenantId, ct);
        if (connection is null) return null;

        if (DateTime.UtcNow < connection.TokenExpiresAtUtc - ExpiryMargin)
            return _tokens.Unprotect(connection.AccessTokenEnc);

        var gate = Locks.GetOrAdd(tenantId, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(ct);
        try
        {
            // Otro request pudo renovar mientras esperábamos el lock: re-leer.
            var fresh = await db.Connections.IgnoreQueryFilters()
                .FirstOrDefaultAsync(c => c.TenantId == tenantId, ct);
            if (fresh is null) return null;
            if (DateTime.UtcNow < fresh.TokenExpiresAtUtc - ExpiryMargin)
                return _tokens.Unprotect(fresh.AccessTokenEnc);

            var tokens = await client.RefreshAsync(_tokens.Unprotect(fresh.RefreshTokenEnc), ct);
            fresh.UpdateTokens(
                tokens.UserId != 0 ? tokens.UserId : fresh.MeliUserId,
                fresh.Nickname, fresh.SiteId,
                _tokens.Protect(tokens.AccessToken),
                string.IsNullOrEmpty(tokens.RefreshToken) ? fresh.RefreshTokenEnc : _tokens.Protect(tokens.RefreshToken),
                DateTime.UtcNow.AddSeconds(tokens.ExpiresInSeconds));
            await db.SaveChangesAsync(ct);

            logger.LogInformation("Token de Mercado Libre renovado para tenant {TenantId}.", tenantId);
            return tokens.AccessToken;
        }
        finally
        {
            gate.Release();
        }
    }
}
