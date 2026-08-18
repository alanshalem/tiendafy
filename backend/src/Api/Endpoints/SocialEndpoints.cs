using System.Text.Json;
using Api.Auth;
using Api.Social;
using Identity.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SharedKernel.Abstractions;
using SharedKernel.Common;
using Social.Infrastructure;

namespace Api.Endpoints;

/// <summary>
/// Redes sociales: la tienda conecta sus cuentas (Facebook/Instagram por OAuth,
/// X por OAuth+PKCE, Telegram por bot token) y arma posts que salen a varias
/// redes a la vez, ahora o programados (el publicador corre cada minuto).
/// Tokens SIEMPRE cifrados y jamás hacia el browser.
/// </summary>
public static class SocialEndpoints
{
    public static RouteGroupBuilder MapSocialEndpoints(this RouteGroupBuilder group)
    {
        MapAccounts(group);
        MapPosts(group);
        return group;
    }

    // -------------------------------------------------- Conectores y cuentas

    private static void MapAccounts(RouteGroupBuilder group)
    {
        var social = group.MapGroup("/admin/social").RequirePermission(Permission.Social);

        // Conectores disponibles + límites por red (el composer valida con esto).
        social.MapGet("/channels", (
            IEnumerable<ISocialConnector> connectors, IEnumerable<ISocialChannel> channels, XSocialChannel x) =>
        {
            var connectorList = connectors
                .Select(c => new { key = c.Key, displayName = c.DisplayName, configured = c.Configured })
                .Append(new { key = x.Key, displayName = x.DisplayName, configured = x.Configured })
                .Append(new { key = "telegram", displayName = "Telegram", configured = true })
                .ToArray();
            return Results.Ok(new
            {
                connectors = connectorList,
                channels = channels.Select(c => new
                {
                    key = c.Key,
                    displayName = c.DisplayName,
                    limits = new { c.Limits.MaxChars, c.Limits.MaxImages, c.Limits.RequiresMedia },
                }),
            });
        });

        social.MapGet("/accounts", async (ITenantContext tenant, SocialDbContext db, CancellationToken ct) =>
        {
            var accounts = await db.Accounts.AsNoTracking()
                .OrderBy(a => a.Provider).ThenBy(a => a.Name)
                .ToListAsync(ct);
            return Results.Ok(new { accounts = accounts.Select(AccountDto) });
        });

        // Arranque del OAuth: devuelve la URL a la que el panel manda el browser.
        social.MapPost("/accounts/connect/{connector}", (
            string connector, ITenantContext tenant,
            IEnumerable<ISocialConnector> connectors, XSocialChannel x, SocialTokenService tokens) =>
        {
            if (connector == "x")
            {
                if (!x.Configured) return NotConfigured("X");
                var verifier = XSocialChannel.CreateVerifier();
                return Results.Ok(new { authUrl = x.BuildAuthUrl(tokens.ProtectState(tenant.TenantId.Value, verifier), verifier) });
            }

            var found = connectors.FirstOrDefault(c => c.Key == connector);
            if (found is null)
                return Error.Validation("Social.UnknownConnector", "Esa red no existe.").ToProblem();
            if (!found.Configured) return NotConfigured(found.DisplayName);
            return Results.Ok(new { authUrl = found.BuildAuthUrl(tokens.ProtectState(tenant.TenantId.Value)) });
        });

        // Telegram entra por formulario: bot token + chat, validados con getChat.
        social.MapPost("/accounts/telegram", async (
            SocialTelegramRequest request, ITenantContext tenant,
            TelegramChannel telegram, SocialTokenService tokens, SocialDbContext db, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.BotToken) || string.IsNullOrWhiteSpace(request.ChatId))
                return Error.Validation("Social.TelegramEmpty", "Cargá el token del bot y el chat.").ToProblem();

            var candidate = await telegram.ValidateConnectionAsync(request.BotToken.Trim(), request.ChatId.Trim(), ct);
            if (candidate.IsFailure) return candidate.Error.ToProblem();

            var account = await UpsertAccountAsync(db, tokens, tenant.TenantId.Value, candidate.Value, ct);
            await db.SaveChangesAsync(ct);
            return Results.Ok(AccountDto(account));
        });

        social.MapDelete("/accounts/{id:guid}", async (
            Guid id, ITenantContext tenant, SocialDbContext db, CancellationToken ct) =>
        {
            var account = await db.Accounts.FirstOrDefaultAsync(a => a.Id == id, ct);
            if (account is null) return Results.NoContent();
            db.Accounts.Remove(account);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        // Callback OAuth público: el tenant viaja firmado en el state (15 min).
        group.MapGet("/social/oauth/callback/{connector}", async (
            string connector, string? code, string? state,
            IEnumerable<ISocialConnector> connectors, XSocialChannel x,
            SocialTokenService tokens, SocialDbContext db, IOptions<SocialOptions> options,
            ILoggerFactory loggerFactory, CancellationToken ct) =>
        {
            var logger = loggerFactory.CreateLogger("SocialOAuth");
            var returnUrl = options.Value.AdminReturnUrl;
            if (string.IsNullOrEmpty(code) || string.IsNullOrEmpty(state))
                return Results.Redirect($"{returnUrl}?social=error");

            var payload = tokens.TryUnprotectState(state);
            if (payload is null) return Results.Redirect($"{returnUrl}?social=error");
            var (tenantId, verifier) = payload.Value;

            try
            {
                Result<IReadOnlyList<SocialAccountCandidate>> result;
                if (connector == "x" && verifier is not null)
                {
                    result = await x.CompleteConnectAsync(code, verifier, ct);
                }
                else
                {
                    var found = connectors.FirstOrDefault(c => c.Key == connector);
                    if (found is null) return Results.Redirect($"{returnUrl}?social=error");
                    result = await found.CompleteConnectAsync(code, ct);
                }
                if (result.IsFailure)
                {
                    logger.LogWarning("Conexión social {Connector} falló: {Error}", connector, result.Error.Message);
                    return Results.Redirect($"{returnUrl}?social=error");
                }

                foreach (var candidate in result.Value)
                    await UpsertAccountAsync(db, tokens, tenantId, candidate, ct);
                await db.SaveChangesAsync(ct);

                logger.LogInformation("{Count} cuenta(s) de {Connector} conectadas para tenant {TenantId}.",
                    result.Value.Count, connector, tenantId);
                return Results.Redirect($"{returnUrl}?social=connected");
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "OAuth social {Connector} falló para tenant {TenantId}.", connector, tenantId);
                return Results.Redirect($"{returnUrl}?social=error");
            }
        });
    }

    /// <summary>Upsert por (tenant, provider, provider_id): reconectar repara el token, no duplica.</summary>
    private static async Task<SocialAccount> UpsertAccountAsync(
        SocialDbContext db, SocialTokenService tokens, Guid tenantId, SocialAccountCandidate c, CancellationToken ct)
    {
        var encrypted = tokens.Protect(c.TokenJson);
        var existing = await db.Accounts.IgnoreQueryFilters().FirstOrDefaultAsync(
            a => a.TenantId == tenantId && a.Provider == c.Provider && a.ProviderId == c.ProviderId, ct);
        if (existing is not null)
        {
            existing.Reauthorize(encrypted, c.Name, c.Username, c.AvatarUrl, c.DataJson);
            return existing;
        }
        var created = SocialAccount.Create(
            tenantId, c.Provider, c.ProviderId, c.Name, c.Username, c.AvatarUrl, encrypted, c.DataJson);
        db.Accounts.Add(created);
        return created;
    }

    private static IResult NotConfigured(string name) =>
        Error.Validation("Social.NotConfigured",
            $"La integración con {name} no está configurada en esta plataforma.").ToProblem();

    private static object AccountDto(SocialAccount a) => new
    {
        a.Id,
        a.Provider,
        a.ProviderId,
        a.Name,
        a.Username,
        a.AvatarUrl,
        a.Authorized,
        a.ConnectedAtUtc,
    };

    // ------------------------------------------------------------------ Posts

    private static void MapPosts(RouteGroupBuilder group)
    {
        var posts = group.MapGroup("/admin/social/posts").RequirePermission(Permission.Social);

        // Lista para calendario y bandeja: rango por fecha efectiva (programada o creada).
        posts.MapGet("", async (
            ITenantContext tenant, SocialDbContext db,
            DateTime? from, DateTime? to, string? status, CancellationToken ct) =>
        {
            var query = db.Posts.AsNoTracking();
            if (from is { } f) query = query.Where(p => (p.ScheduledAtUtc ?? p.CreatedAtUtc) >= AsUtc(f));
            if (to is { } t) query = query.Where(p => (p.ScheduledAtUtc ?? p.CreatedAtUtc) <= AsUtc(t));
            if (Enum.TryParse<SocialPostStatus>(status, true, out var st))
                query = query.Where(p => p.Status == st);

            var rows = await query
                .OrderByDescending(p => p.ScheduledAtUtc ?? p.CreatedAtUtc)
                .Take(200)
                .ToListAsync(ct);
            var accounts = await AccountsByIdAsync(db, rows.SelectMany(p => p.Targets), ct);
            return Results.Ok(new { posts = rows.Select(p => PostDto(p, accounts)) });
        });

        posts.MapPost("", async (
            SocialPostRequest request, ITenantContext tenant, SocialDbContext db, CancellationToken ct) =>
        {
            var media = NormalizeMedia(request.MediaUrls);
            if (media.IsFailure) return media.Error.ToProblem();

            var created = SocialPost.Create(tenant.TenantId.Value, request.Content, media.Value);
            if (created.IsFailure) return created.Error.ToProblem();
            var post = created.Value;

            var applied = await ApplyTargetsAsync(db, post, request.Targets, ct);
            if (applied.IsFailure) return applied.Error.ToProblem();

            db.Posts.Add(post);
            await db.SaveChangesAsync(ct);
            var accounts = await AccountsByIdAsync(db, post.Targets, ct);
            return Results.Ok(PostDto(post, accounts));
        });

        posts.MapPut("/{id:guid}", async (
            Guid id, SocialPostRequest request, ITenantContext tenant, SocialDbContext db, CancellationToken ct) =>
        {
            var post = await db.Posts.FirstOrDefaultAsync(p => p.Id == id, ct);
            if (post is null) return NotFound();

            var media = NormalizeMedia(request.MediaUrls);
            if (media.IsFailure) return media.Error.ToProblem();

            var updated = post.UpdateContent(request.Content, media.Value);
            if (updated.IsFailure) return updated.Error.ToProblem();

            var applied = await ApplyTargetsAsync(db, post, request.Targets, ct);
            if (applied.IsFailure) return applied.Error.ToProblem();

            await db.SaveChangesAsync(ct);
            var accounts = await AccountsByIdAsync(db, post.Targets, ct);
            return Results.Ok(PostDto(post, accounts));
        });

        // Programar (fecha futura) o publicar ya (sin fecha: el worker lo toma al toque).
        posts.MapPost("/{id:guid}/schedule", async (
            Guid id, SocialScheduleRequest request, ITenantContext tenant, SocialDbContext db, CancellationToken ct) =>
        {
            var post = await db.Posts.FirstOrDefaultAsync(p => p.Id == id, ct);
            if (post is null) return NotFound();

            var result = post.Schedule(request.ScheduledAtUtc is { } d ? AsUtc(d) : null);
            if (result.IsFailure) return result.Error.ToProblem();
            await db.SaveChangesAsync(ct);
            var accounts = await AccountsByIdAsync(db, post.Targets, ct);
            return Results.Ok(PostDto(post, accounts));
        });

        posts.MapPost("/{id:guid}/unschedule", async (
            Guid id, ITenantContext tenant, SocialDbContext db, CancellationToken ct) =>
        {
            var post = await db.Posts.FirstOrDefaultAsync(p => p.Id == id, ct);
            if (post is null) return NotFound();

            var result = post.Unschedule();
            if (result.IsFailure) return result.Error.ToProblem();
            await db.SaveChangesAsync(ct);
            var accounts = await AccountsByIdAsync(db, post.Targets, ct);
            return Results.Ok(PostDto(post, accounts));
        });

        posts.MapDelete("/{id:guid}", async (
            Guid id, ITenantContext tenant, SocialDbContext db, CancellationToken ct) =>
        {
            var post = await db.Posts.FirstOrDefaultAsync(p => p.Id == id, ct);
            if (post is null) return Results.NoContent();
            if (post.ScheduleStatus == SocialScheduleStatus.Processing)
                return Error.Conflict("Social.Processing", "El post se está publicando: esperá a que termine.").ToProblem();
            db.Posts.Remove(post);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });
    }

    /// <summary>Valida que las cuentas destino existan en la tienda y aplica los targets.</summary>
    private static async Task<Result> ApplyTargetsAsync(
        SocialDbContext db, SocialPost post, IReadOnlyList<SocialTargetRequest>? targets, CancellationToken ct)
    {
        var list = targets ?? [];
        if (list.Count > 0)
        {
            var ids = list.Select(t => t.AccountId).Distinct().ToList();
            var known = await db.Accounts.AsNoTracking()
                .Where(a => ids.Contains(a.Id)).Select(a => a.Id).ToListAsync(ct);
            if (known.Count != ids.Count)
                return Result.Failure(Error.Validation("Social.UnknownAccount", "Alguna cuenta elegida ya no existe."));
        }
        return post.SetTargets([.. list.Select(t => (t.AccountId, t.ContentOverride))]);
    }

    private static Result<string> NormalizeMedia(IReadOnlyList<string>? mediaUrls)
    {
        var urls = (mediaUrls ?? [])
            .Select(u => u?.Trim() ?? "")
            .Where(u => u.Length > 0)
            .ToList();
        if (urls.Count > 10)
            return Result.Failure<string>(Error.Validation("Social.TooManyImages", "Máximo 10 imágenes por post."));
        if (urls.Any(u => u.Length > 500 || !Uri.IsWellFormedUriString(u, UriKind.Absolute)))
            return Result.Failure<string>(Error.Validation("Social.BadImageUrl", "Alguna URL de imagen no es válida."));
        return JsonSerializer.Serialize(urls);
    }

    private static async Task<Dictionary<Guid, SocialAccount>> AccountsByIdAsync(
        SocialDbContext db, IEnumerable<SocialPostTarget> targets, CancellationToken ct)
    {
        var ids = targets.Select(t => t.AccountId).Distinct().ToList();
        return ids.Count == 0
            ? []
            : await db.Accounts.AsNoTracking().Where(a => ids.Contains(a.Id)).ToDictionaryAsync(a => a.Id, ct);
    }

    private static object PostDto(SocialPost p, Dictionary<Guid, SocialAccount> accounts) => new
    {
        p.Id,
        p.Content,
        mediaUrls = JsonSerializer.Deserialize<List<string>>(p.MediaUrlsJson) ?? [],
        status = p.Status.ToString(),
        scheduleStatus = p.ScheduleStatus.ToString(),
        p.ScheduledAtUtc,
        p.PublishedAtUtc,
        p.CreatedAtUtc,
        p.IsEditable,
        targets = p.Targets.Select(t => new
        {
            t.AccountId,
            provider = accounts.TryGetValue(t.AccountId, out var a) ? a.Provider : null,
            accountName = accounts.TryGetValue(t.AccountId, out var n) ? n.Name : "Cuenta eliminada",
            t.ContentOverride,
            t.ProviderPostId,
            t.ExternalUrl,
            t.Error,
            t.PublishedAtUtc,
        }),
    };

    /// <summary>El panel manda UTC; sin zona explícita se asume UTC (nunca hora del server).</summary>
    private static DateTime AsUtc(DateTime value) => value.Kind switch
    {
        DateTimeKind.Utc => value,
        DateTimeKind.Local => value.ToUniversalTime(),
        _ => DateTime.SpecifyKind(value, DateTimeKind.Utc),
    };

    private static IResult NotFound() =>
        Error.NotFound("Social.PostNotFound", "Ese post no existe.").ToProblem();
}

public sealed record SocialTargetRequest(Guid AccountId, string? ContentOverride);
public sealed record SocialPostRequest(string? Content, IReadOnlyList<string>? MediaUrls, IReadOnlyList<SocialTargetRequest>? Targets);
public sealed record SocialScheduleRequest(DateTime? ScheduledAtUtc);
public sealed record SocialTelegramRequest(string BotToken, string ChatId);
