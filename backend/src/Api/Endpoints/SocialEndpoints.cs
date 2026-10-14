using System.Text.Json;
using Api.Auth;
using Api.Social;
using Identity.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Orders.Infrastructure.Persistence;
using SharedKernel.Abstractions;
using SharedKernel.Common;
using Social.Contracts;
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
        var social = group.MapGroup("/admin/social").RequirePermission(Permission.SocialPublish);

        // Conectores disponibles + límites por red (el composer valida con esto).
        social.MapGet("/channels", (
            IEnumerable<ISocialConnector> connectors, IEnumerable<ISocialChannel> channels) =>
        {
            // Telegram no tiene conector OAuth (bot por formulario): entra a mano.
            var telegram = channels.First(c => c.Key == "telegram");
            var connectorList = connectors
                .Select(c => new { key = c.Key, displayName = c.DisplayName, configured = c.Configured })
                .Append(new { key = telegram.Key, displayName = telegram.DisplayName, configured = true })
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

        social.MapGet("/accounts", async (SocialDbContext db, CancellationToken ct) =>
        {
            var accounts = await db.Accounts.AsNoTracking()
                .OrderBy(a => a.Provider).ThenBy(a => a.Name)
                .ToListAsync(ct);
            return Results.Ok(new { accounts = accounts.Select(AccountDto) });
        });

        // Arranque del OAuth: devuelve la URL a la que el panel manda el browser.
        social.MapPost("/accounts/connect/{connector}", (
            string connector, ITenantContext tenant,
            IEnumerable<ISocialConnector> connectors, SocialTokenService tokens) =>
        {
            var found = connectors.FirstOrDefault(c => c.Key == connector);
            if (found is null)
                return Error.Validation("Social.UnknownConnector", "Esa red no existe.").ToProblem();
            if (!found.Configured) return NotConfigured(found.DisplayName);

            var verifier = found.UsesPkce ? SocialPkce.CreateVerifier() : null;
            return Results.Ok(new
            {
                authUrl = found.BuildAuthUrl(tokens.ProtectState(tenant.TenantId.Value, verifier), verifier),
            });
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

        social.MapDelete("/accounts/{id:guid}", async (Guid id, SocialDbContext db, CancellationToken ct) =>
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
            IEnumerable<ISocialConnector> connectors,
            SocialTokenService tokens, SocialDbContext db, IOptions<SocialOptions> options,
            ILoggerFactory loggerFactory, CancellationToken ct) =>
        {
            var logger = loggerFactory.CreateLogger("SocialOAuth");
            var returnUrl = options.Value.AdminReturnUrl;
            if (string.IsNullOrEmpty(code) || string.IsNullOrEmpty(state)) return Back(returnUrl, ok: false);

            var payload = tokens.TryUnprotectState(state);
            if (payload is null) return Back(returnUrl, ok: false);
            var (tenantId, verifier) = payload.Value;

            var found = connectors.FirstOrDefault(c => c.Key == connector);
            if (found is null) return Back(returnUrl, ok: false);

            try
            {
                var result = await found.CompleteConnectAsync(code, verifier, ct);
                if (result.IsFailure)
                {
                    logger.LogWarning("Conexión social {Connector} falló: {Error}", connector, result.Error.Message);
                    return Back(returnUrl, ok: false);
                }

                foreach (var candidate in result.Value)
                    await UpsertAccountAsync(db, tokens, tenantId, candidate, ct);
                await db.SaveChangesAsync(ct);

                logger.LogInformation("{Count} cuenta(s) de {Connector} conectadas para tenant {TenantId}.",
                    result.Value.Count, connector, tenantId);
                return Back(returnUrl, ok: true);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "OAuth social {Connector} falló para tenant {TenantId}.", connector, tenantId);
                return Back(returnUrl, ok: false);
            }
        });
    }

    private static IResult Back(string returnUrl, bool ok) =>
        Results.Redirect($"{returnUrl}?social={(ok ? "connected" : "error")}");

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
        var posts = group.MapGroup("/admin/social/posts").RequirePermission(Permission.SocialPublish);

        // Lista para calendario y bandeja: rango por fecha efectiva (programada o
        // creada). El calendario pide un mes (from/to) y la bandeja pagina con
        // offset/limit; sin límite, el techo de siempre (200), así un mes
        // cargado entra entero en el calendario.
        posts.MapGet("", async (
            SocialDbContext db, OrdersDbContext ordersDb,
            ITenantContext tenant, DateTime? from, DateTime? to, string? status, CancellationToken ct,
            int? offset = null, int? limit = null) =>
        {
            var query = db.Posts.AsNoTracking();
            if (from is { } f) query = query.Where(p => (p.ScheduledAtUtc ?? p.CreatedAtUtc) >= AsUtc(f));
            if (to is { } t) query = query.Where(p => (p.ScheduledAtUtc ?? p.CreatedAtUtc) <= AsUtc(t));
            if (Enum.TryParse<SocialPostStatus>(status, true, out var st))
                query = query.Where(p => p.Status == st);

            // El id desempata: dos posts a la misma hora no pueden cambiar de
            // página entre un pedido y el siguiente.
            var (rows, total) = await query
                .OrderByDescending(p => p.ScheduledAtUtc ?? p.CreatedAtUtc)
                .ThenBy(p => p.Id)
                .PageAsync(offset, limit, ct, defaultLimit: Paging.MaxLimit);
            var accounts = await AccountsByIdAsync(db, rows.SelectMany(p => p.Targets), ct);
            var attribution = await CouponAttributionAsync(ordersDb, tenant.TenantId, rows, ct);
            return Results.Ok(new
            {
                posts = rows.Select(p => PostDto(p, accounts, attribution.GetValueOrDefault(p.Id))),
                total,
            });
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
            post.SetCoupon(request.CouponCode);

            db.Posts.Add(post);
            await db.SaveChangesAsync(ct);
            var accounts = await AccountsByIdAsync(db, post.Targets, ct);
            return Results.Ok(PostDto(post, accounts));
        });

        posts.MapPut("/{id:guid}", (Guid id, SocialPostRequest request, SocialDbContext db, CancellationToken ct) =>
            MutatePostAsync(db, id, async post =>
            {
                var media = NormalizeMedia(request.MediaUrls);
                if (media.IsFailure) return media.Error;

                var updated = post.UpdateContent(request.Content, media.Value);
                if (updated.IsFailure) return updated.Error;

                var applied = await ApplyTargetsAsync(db, post, request.Targets, ct);
                if (applied.IsFailure) return applied.Error;
                var coupon = post.SetCoupon(request.CouponCode);
                return coupon.IsFailure ? coupon.Error : null;
            }, ct));

        // Programar (fecha futura) o publicar ya (sin fecha: el worker lo toma al toque).
        posts.MapPost("/{id:guid}/schedule", (
            Guid id, SocialScheduleRequest request, SocialDbContext db, CancellationToken ct) =>
            MutatePostAsync(db, id, post =>
            {
                var result = post.Schedule(request.ScheduledAtUtc is { } d ? AsUtc(d) : null);
                return Task.FromResult(result.IsFailure ? result.Error : (Error?)null);
            }, ct));

        posts.MapPost("/{id:guid}/unschedule", (Guid id, SocialDbContext db, CancellationToken ct) =>
            MutatePostAsync(db, id, post =>
            {
                var result = post.Unschedule();
                return Task.FromResult(result.IsFailure ? result.Error : (Error?)null);
            }, ct));

        posts.MapDelete("/{id:guid}", async (Guid id, SocialDbContext db, CancellationToken ct) =>
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

    /// <summary>
    /// Esqueleto común de las mutaciones de un post: buscar → mutar (null =
    /// ok, Error = problem) → guardar → devolver el DTO completo.
    /// </summary>
    private static async Task<IResult> MutatePostAsync(
        SocialDbContext db, Guid id, Func<SocialPost, Task<Error?>> mutate, CancellationToken ct)
    {
        var post = await db.Posts.FirstOrDefaultAsync(p => p.Id == id, ct);
        if (post is null) return Error.NotFound("Social.PostNotFound", "Ese post no existe.").ToProblem();

        var error = await mutate(post);
        if (error is { } e) return e.ToProblem();

        await db.SaveChangesAsync(ct);
        var accounts = await AccountsByIdAsync(db, post.Targets, ct);
        return Results.Ok(PostDto(post, accounts));
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

    /// <summary>
    /// Ventas atribuidas a cada post por su cupón (mismo criterio que las
    /// campañas de email): órdenes pagadas con ese código DESPUÉS de publicar.
    /// </summary>
    private static async Task<Dictionary<Guid, (int Orders, long RevenueMinor)>> CouponAttributionAsync(
        OrdersDbContext ordersDb, SharedKernel.Common.TenantId tenantId,
        IReadOnlyList<SocialPost> posts, CancellationToken ct)
    {
        var withCoupon = posts
            .Where(p => p.CouponCode is not null && p.PublishedAtUtc is not null)
            .ToList();
        if (withCoupon.Count == 0) return [];

        var codes = withCoupon.Select(p => p.CouponCode!).Distinct().ToList();
        var earliest = withCoupon.Min(p => p.PublishedAtUtc!.Value);
        var orders = await ordersDb.Orders.AsNoTracking()
            .Where(o => o.TenantId == tenantId && o.CouponCode != null
                && codes.Contains(o.CouponCode) && o.PaidAtUtc >= earliest)
            .Select(o => new { o.CouponCode, o.PaidAtUtc, Total = o.Total.AmountInMinorUnits })
            .ToListAsync(ct);

        return withCoupon.ToDictionary(
            p => p.Id,
            p =>
            {
                var mine = orders.Where(o => o.CouponCode == p.CouponCode && o.PaidAtUtc >= p.PublishedAtUtc).ToList();
                return (mine.Count, mine.Sum(o => o.Total));
            });
    }

    private static object PostDto(
        SocialPost p, Dictionary<Guid, SocialAccount> accounts, (int Orders, long RevenueMinor) attribution = default) => new
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
            couponCode = p.CouponCode,
            attributedOrders = attribution.Orders,
            attributedRevenueMinor = attribution.RevenueMinor,
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
}

public sealed record SocialTargetRequest(Guid AccountId, string? ContentOverride);
public sealed record SocialPostRequest(
    string? Content,
    IReadOnlyList<string>? MediaUrls,
    IReadOnlyList<SocialTargetRequest>? Targets,
    string? CouponCode = null);
public sealed record SocialScheduleRequest(DateTime? ScheduledAtUtc);
public sealed record SocialTelegramRequest(string BotToken, string ChatId);
