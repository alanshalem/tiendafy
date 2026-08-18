using System.Text.Json;
using System.Text.Json.Nodes;
using Api.Workers;
using Microsoft.EntityFrameworkCore;
using Social.Infrastructure;

namespace Api.Social;

/// <summary>
/// Publicador de posts programados (diseño Mixpost). Cada 60 s toma los posts
/// Scheduled+Pending vencidos y los reclama con un UPDATE atómico POR FILA
/// (rowsAffected == 1 ⇒ este proceso es el dueño) — idempotente ante múltiples
/// instancias. Publica target por target: el fallo de una red no frena a las
/// demás; 401 marca la cuenta como no autorizada; si un canal renovó el token
/// (X), acá se persiste cifrado. Corre sin tenant (filtro global apagado).
/// </summary>
public sealed class SocialPublishWorker(
    IServiceScopeFactory scopeFactory,
    ILogger<SocialPublishWorker> logger) : PollingWorker(TimeSpan.FromSeconds(60))
{
    private const int BatchSize = 10;

    protected override void LogPollFailure(Exception ex) =>
        logger.LogError(ex, "Publicador social falló.");

    protected override async Task PollOnceAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var sp = scope.ServiceProvider;
        var db = sp.GetRequiredService<SocialDbContext>();
        var tokens = sp.GetRequiredService<SocialTokenService>();
        var channels = sp.GetServices<ISocialChannel>().ToDictionary(c => c.Key);

        var now = DateTime.UtcNow;
        var due = await db.Posts
            .Where(p => p.Status == SocialPostStatus.Scheduled
                && p.ScheduleStatus == SocialScheduleStatus.Pending
                && p.ScheduledAtUtc <= now)
            .OrderBy(p => p.ScheduledAtUtc)
            .Take(BatchSize)
            .ToListAsync(ct);

        foreach (var post in due)
        {
            // Claim atómico por fila: si otra instancia llegó antes, 0 filas y se saltea.
            var claimed = await db.Posts
                .Where(p => p.Id == post.Id && p.ScheduleStatus == SocialScheduleStatus.Pending)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(p => p.ScheduleStatus, SocialScheduleStatus.Processing)
                    .SetProperty(p => p.UpdatedAtUtc, DateTime.UtcNow), ct);
            if (claimed != 1) continue;
            post.MarkProcessing(); // alinea la entidad trackeada con la DB

            await PublishTargetsAsync(db, tokens, channels, post, ct);

            post.FinishProcessing();
            await db.SaveChangesAsync(ct);
            logger.LogInformation("Post social {Post} cerró en {Status}.", post.Id, post.Status);
        }
    }

    private async Task PublishTargetsAsync(
        SocialDbContext db, SocialTokenService tokens,
        Dictionary<string, ISocialChannel> channels, SocialPost post, CancellationToken ct)
    {
        var accountIds = post.Targets.Select(t => t.AccountId).ToList();
        var accounts = await db.Accounts
            .Where(a => accountIds.Contains(a.Id))
            .ToDictionaryAsync(a => a.Id, ct);
        var mediaUrls = JsonSerializer.Deserialize<List<string>>(post.MediaUrlsJson) ?? [];

        foreach (var target in post.Targets)
        {
            if (target.PublishedAtUtc is not null) continue; // ya salió en un intento anterior
            if (!accounts.TryGetValue(target.AccountId, out var account))
            {
                target.MarkFailed("La cuenta ya no existe.");
                continue;
            }
            if (!account.Authorized)
            {
                target.MarkFailed("La cuenta necesita reconectarse.");
                continue;
            }
            if (!channels.TryGetValue(account.Provider, out var channel))
            {
                target.MarkFailed($"Red desconocida: {account.Provider}.");
                continue;
            }
            var tokenJson = tokens.TryUnprotect(account.AccessTokenEncrypted);
            if (tokenJson is null)
            {
                account.MarkUnauthorized();
                target.MarkFailed("La cuenta necesita reconectarse.");
                continue;
            }

            try
            {
                var result = await channel.PublishAsync(
                    tokenJson, BuildDataJson(account), post.ContentFor(target), mediaUrls, ct);

                // El canal renovó el token durante la publicación (X): persistir cifrado.
                if (result.RefreshedTokenJson is not null)
                    account.Reauthorize(tokens.Protect(result.RefreshedTokenJson),
                        account.Name, account.Username, account.AvatarUrl, account.DataJson);

                switch (result.Status)
                {
                    case SocialPublishStatus.Ok:
                        target.MarkPublished(result.ProviderPostId, result.ExternalUrl);
                        break;
                    case SocialPublishStatus.Unauthorized:
                        account.MarkUnauthorized();
                        target.MarkFailed(result.Message ?? "Token vencido: reconectá la cuenta.");
                        break;
                    case SocialPublishStatus.RateLimited:
                        var wait = result.RetryAfter is { } r ? $" Probá de nuevo en {(int)Math.Ceiling(r.TotalMinutes)} min." : "";
                        target.MarkFailed((result.Message ?? "La red limitó las publicaciones.") + wait);
                        break;
                    default:
                        target.MarkFailed(result.Message ?? "Error al publicar.");
                        break;
                }
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Publicación social lanzó excepción (post {Post}, cuenta {Account}).", post.Id, account.Id);
                target.MarkFailed("Error inesperado al publicar.");
            }
        }
    }

    /// <summary>
    /// dataJson sintético para el canal: provider_id + username de la cuenta,
    /// más lo que la conexión haya guardado (page_id del IG, etc.).
    /// </summary>
    private static string BuildDataJson(SocialAccount account)
    {
        var node = (string.IsNullOrEmpty(account.DataJson)
            ? null
            : JsonNode.Parse(account.DataJson) as JsonObject) ?? [];
        node["provider_id"] = account.ProviderId;
        node["username"] = account.Username;
        return node.ToJsonString();
    }
}
