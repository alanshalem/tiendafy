using System.Collections.Concurrent;
using Microsoft.EntityFrameworkCore;
using Social.Contracts;
using Social.Infrastructure;

namespace Api.Social;

/// <summary>
/// El token con el que se publica en una cuenta, renovado si la red lo pide
/// (<see cref="ISocialTokenRefresher"/>: X). Mismo esquema que
/// <c>MeliTokenService</c>, porque el problema es el mismo: el refresh token
/// es de un solo uso.
/// <list type="bullet">
/// <item>Renovación SERIALIZADA por cuenta, con re-lectura dentro del lock: si
/// otro publicador ya renovó mientras esperábamos, se usa ese token. Dos
/// renovaciones con el mismo refresh token matan la conexión.</item>
/// <item>El token nuevo se guarda apenas vuelve, ANTES de publicar. Antes viajaba
/// en el resultado de publicar: si el POST /tweets fallaba por la red, se perdía
/// y la cuenta quedaba muerta hasta reconectarla.</item>
/// </list>
/// </summary>
public sealed class SocialAccountTokens(SocialDbContext db, SocialTokenService tokens, ILogger<SocialAccountTokens> logger)
{
    private static readonly ConcurrentDictionary<Guid, SemaphoreSlim> Locks = new();

    /// <summary>
    /// Token JSON vigente de la cuenta, o null si hay que reconectarla (no se
    /// pudo descifrar o la red rechazó la renovación). <paramref name="account"/>
    /// tiene que estar trackeada por este mismo contexto.
    /// </summary>
    public async Task<string?> ForPublishingAsync(SocialAccount account, ISocialChannel channel, CancellationToken ct)
    {
        var tokenJson = tokens.TryUnprotect(account.AccessTokenEncrypted);
        if (tokenJson is null || channel is not ISocialTokenRefresher refresher || !refresher.NeedsRenewal(tokenJson))
            return tokenJson;

        var gate = Locks.GetOrAdd(account.Id, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(ct);
        try
        {
            // Otro publicador pudo renovar mientras esperábamos el lock: re-leer.
            var stored = await db.Accounts.IgnoreQueryFilters().AsNoTracking()
                .Where(a => a.Id == account.Id)
                .Select(a => a.AccessTokenEncrypted)
                .FirstOrDefaultAsync(ct);
            if (stored is null) return null;
            if (stored != account.AccessTokenEncrypted)
            {
                account.RotateToken(stored);
                tokenJson = tokens.TryUnprotect(stored);
                if (tokenJson is null || !refresher.NeedsRenewal(tokenJson)) return tokenJson;
            }

            var renewed = await refresher.RenewAsync(tokenJson, ct);
            if (renewed is null) return null;

            // Guardar YA: si la publicación que sigue falla, el refresh token
            // nuevo (el único que sirve desde ahora) no se pierde.
            account.RotateToken(tokens.Protect(renewed));
            await db.SaveChangesAsync(ct);
            logger.LogInformation("Token de {Provider} renovado para la cuenta social {Account}.", account.Provider, account.Id);
            return renewed;
        }
        finally
        {
            gate.Release();
        }
    }
}
