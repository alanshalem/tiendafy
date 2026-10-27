using Api.Auth;
using Api.Reviews;
using Api.Shop;
using Catalog.Infrastructure.Persistence;
using Customers.Infrastructure;
using Identity.Infrastructure;
using Media.Infrastructure;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Notifications.Infrastructure;
using Orders.Infrastructure.Persistence;
using Reviews.Infrastructure;
using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace Api.Endpoints;

/// <summary>
/// Reseñas de productos: lo que ve el comprador en la ficha, el alta (solo con
/// el link de una venta despachada), los votos y denuncias, y la moderación
/// del panel.
///
/// <para>
/// Reglas contra reseñas truchas, todas en el servidor:
/// <list type="bullet">
/// <item>Sin link firmado de una venta despachada no se escribe nada: no hay
/// alta anónima ni desde el panel (la tienda modera, no redacta).</item>
/// <item>Una reseña por línea de venta (índice único).</item>
/// <item>Las fotos tienen que ser imágenes subidas a esta tienda por este flujo.</item>
/// <item>"Me sirvió" y denuncias cuentan una vez por persona (huella anónima) y
/// tienen límite por IP; tres denuncias distintas la sacan de la tienda hasta
/// que la tienda la mire.</item>
/// </list>
/// </para>
/// </summary>
public static class ReviewEndpoints
{
    /// <summary>Lo único que se acepta como foto de una reseña.</summary>
    private static readonly HashSet<string> PhotoTypes = ["image/jpeg", "image/png", "image/webp"];

    private const int PublicPageSize = 5;
    private const int MaxPublicPageSize = 20;

    public static RouteGroupBuilder MapReviewEndpoints(this RouteGroupBuilder group)
    {
        MapPublic(group);
        MapShop(group);
        MapAdmin(group);
        return group;
    }

    // ------------------------------------------------------------ la tienda

    private static void MapPublic(RouteGroupBuilder group)
    {
        var reviews = group.MapGroup("/reviews").RequireTenant();

        // La ficha: promedio, distribución y una página de aprobadas.
        reviews.MapGet("/products/{productId:guid}", async (
            Guid productId, ITenantContext tenant, ReviewsDbContext db, CancellationToken ct,
            string? sort = null, int page = 1, int pageSize = PublicPageSize, int? rating = null) =>
        {
            var tid = tenant.TenantId.Value;
            page = Math.Max(1, page);
            pageSize = Math.Clamp(pageSize, 1, MaxPublicPageSize);

            if (!await ProductRatings.ShowOnStoreAsync(db, tid, ct))
                return Results.Ok(new
                {
                    enabled = false,
                    summary = new { average = 0m, count = 0, distribution = new int[5] },
                    items = Array.Empty<object>(),
                    total = 0,
                    page,
                    totalPages = 0,
                });

            var approved = db.Reviews.AsNoTracking()
                .Where(r => r.TenantId == tid && r.ProductId == productId && r.Status == ReviewStatus.Approved);

            var byRating = await approved
                .GroupBy(r => r.Rating)
                .Select(g => new { Rating = g.Key, Count = g.Count() })
                .ToListAsync(ct);
            var distribution = Enumerable.Range(1, 5)
                .Select(n => byRating.FirstOrDefault(x => x.Rating == n)?.Count ?? 0)
                .ToArray();
            var count = distribution.Sum();
            var average = count == 0 ? 0m : Math.Round((decimal)byRating.Sum(x => x.Rating * x.Count) / count, 1);

            var filtered = rating is >= 1 and <= 5 ? approved.Where(r => r.Rating == rating) : approved;
            // "Más útiles" primero (lo que más gente marcó), y entre iguales lo
            // más nuevo. "Recientes": lo más nuevo, a secas.
            var ordered = sort == "recent"
                ? filtered.OrderByDescending(r => r.CreatedAtUtc).ThenBy(r => r.Id)
                : filtered.OrderByDescending(r => r.HelpfulCount).ThenByDescending(r => r.CreatedAtUtc).ThenBy(r => r.Id);
            var (items, total) = await ordered.PageAsync((page - 1) * pageSize, pageSize, ct, pageSize, MaxPublicPageSize);

            return Results.Ok(new
            {
                enabled = true,
                summary = new { average, count, distribution },
                items = items.Select(PublicDto),
                total,
                page,
                totalPages = (int)Math.Ceiling(total / (double)pageSize),
            });
        });

        // La invitación: la venta del link y qué se puede opinar de ella.
        reviews.MapGet("/invite", async (
            string? token, ITenantContext tenant, IDataProtectionProvider dp,
            OrdersDbContext orders, CatalogDbContext catalog, ReviewsDbContext db, CancellationToken ct) =>
        {
            var tid = tenant.TenantId.Value;
            var payload = ReviewInviteToken.Unprotect(dp, token, tid);
            if (payload is null) return InvalidLink();

            var resolved = await ReviewEligibility.ResolveAsync(tid, payload.OrderId, orders, catalog, db, ct);
            if (resolved.IsFailure) return resolved.Error.ToProblem();
            var invite = resolved.Value;

            return Results.Ok(new
            {
                orderId = invite.Order.Id,
                authorName = invite.AuthorName,
                items = invite.Lines.Select(l => new
                {
                    orderItemId = l.OrderItemId,
                    productId = l.ProductId,
                    productName = l.ProductName,
                    productSlug = l.ProductSlug,
                    image = l.Image,
                    variantLabel = l.VariantLabel,
                    // Un producto que ya no existe no puede recibir reseñas.
                    canReview = l.ProductId is not null && l.Existing is null,
                    review = l.Existing is null ? null : new
                    {
                        rating = l.Existing.Rating,
                        status = l.Existing.Status.ToString().ToLowerInvariant(),
                    },
                }),
            });
        });

        // Alta: SOLO con el link de una venta despachada, de una línea de esa
        // venta y una vez por línea.
        reviews.MapPost("/", async (
            CreateReviewRequest req, ITenantContext tenant, IDataProtectionProvider dp, MediaOptions media,
            Api.Captcha.ICaptchaVerifier captcha,
            OrdersDbContext orders, CatalogDbContext catalog, ReviewsDbContext db, CancellationToken ct) =>
        {
            if (!await captcha.VerifyAsync(req.Captcha, ct)) return Api.Captcha.CaptchaProblem.Failed();
            var tid = tenant.TenantId.Value;
            var payload = ReviewInviteToken.Unprotect(dp, req.Token, tid);
            if (payload is null) return InvalidLink();

            var resolved = await ReviewEligibility.ResolveAsync(tid, payload.OrderId, orders, catalog, db, ct);
            if (resolved.IsFailure) return resolved.Error.ToProblem();
            var invite = resolved.Value;

            var line = invite.Lines.FirstOrDefault(l => l.OrderItemId == req.OrderItemId);
            if (line is null)
                return Error.NotFound("Review.LineNotFound", "Ese producto no es parte de esta compra.").ToProblem();
            if (line.Existing is not null)
                return AlreadyReviewed();
            if (line.ProductId is not { } productId)
                return Error.Conflict("Review.ProductGone", "Ese producto ya no está en la tienda.").ToProblem();

            var photos = (req.Photos ?? []).Where(u => !string.IsNullOrWhiteSpace(u)).Distinct().ToList();
            if (photos.Any(u => !IsOwnPhoto(media, tid, u)))
                return Error.Validation("Review.PhotoInvalid", "Una de las fotos no es válida: subila de nuevo.").ToProblem();

            var settings = await ProductRatings.SettingsAsync(db, tid, ct);
            var created = ProductReview.Create(
                tid, productId, line.VariantId, invite.Order.Id, line.OrderItemId,
                req.Rating, req.Title, req.Body, invite.AuthorName, invite.Order.BuyerEmail,
                line.ProductName, line.VariantLabel, photos, settings.AutoApproves(req.Rating));
            if (created.IsFailure) return created.Error.ToProblem();

            db.Reviews.Add(created.Value);
            try
            {
                await db.SaveChangesAsync(ct);
            }
            catch (DbUpdateException)
            {
                // Dos envíos a la vez de la misma línea: el índice único decide.
                return AlreadyReviewed();
            }

            return Results.Created($"/api/v1/reviews/{created.Value.Id}", new
            {
                id = created.Value.Id,
                status = created.Value.Status.ToString().ToLowerInvariant(),
            });
        }).RequireRateLimiting("auth");

        // Fotos de la reseña: el mismo storage que las del catálogo, pero solo
        // imágenes y solo con un link válido (no es un hosting abierto).
        reviews.MapPost("/photos", async (
            HttpRequest request, ITenantContext tenant, IDataProtectionProvider dp, IMediaStorage storage,
            OrdersDbContext orders, CancellationToken ct) =>
        {
            if (!request.HasFormContentType)
                return Error.Validation("Review.MultipartExpected", "Se espera multipart/form-data.").ToProblem();
            var form = await request.ReadFormAsync(ct);
            var tid = tenant.TenantId.Value;
            var payload = ReviewInviteToken.Unprotect(dp, form["token"].ToString(), tid);
            if (payload is null) return InvalidLink();

            var order = await orders.Orders.AsNoTracking()
                .FirstOrDefaultAsync(o => o.Id == payload.OrderId && o.TenantId == TenantId.From(tid), ct);
            if (order is null || !ReviewEligibility.OrderAllowsReviews(order))
                return Error.Conflict("Review.NotDelivered", "Vas a poder opinar cuando tu compra esté despachada.").ToProblem();

            var file = form.Files.GetFile("file");
            if (file is null || file.Length <= 0)
                return Error.Validation("Review.PhotoMissing", "Elegí una foto.").ToProblem();
            if (!PhotoTypes.Contains(file.ContentType.ToLowerInvariant()))
                return Error.Validation("Review.PhotoType", "La foto tiene que ser JPG, PNG o WebP.").ToProblem();
            if (file.Length > S3MediaStorage.MaxImageBytes)
                return Error.Validation("Media.TooLarge",
                    $"La foto pesa demasiado: el máximo es {S3MediaStorage.MaxImageBytes / 1024 / 1024} MB.").ToProblem();

            // En memoria: la verificación del contenido real (magic bytes)
            // necesita volver al principio del archivo.
            using var buffer = new MemoryStream();
            await using (var s = file.OpenReadStream())
                await s.CopyToAsync(buffer, ct);
            buffer.Seek(0, SeekOrigin.Begin);

            var upload = await storage.UploadAsync(tid, buffer, file.ContentType, buffer.Length, ct);
            return upload.IsSuccess ? Results.Ok(new { url = upload.Value }) : upload.Error.ToProblem();
        }).RequireRateLimiting("auth").DisableAntiforgery();

        // "Me sirvió": una vez por persona.
        reviews.MapPost("/{id:guid}/helpful", async (
            Guid id, HttpContext http, ITenantContext tenant, ReviewsDbContext db, CancellationToken ct) =>
        {
            var tid = tenant.TenantId.Value;
            var review = await db.Reviews.AsNoTracking()
                .FirstOrDefaultAsync(r => r.Id == id && r.TenantId == tid && r.Status == ReviewStatus.Approved, ct);
            if (review is null) return Results.NotFound();

            var fingerprint = VisitorFingerprint.Of(http, tid);
            if (await TryVoteAsync(db, ReviewVote.Create(tid, id, ReviewVote.Helpful, fingerprint), ct))
                // Suma atómica: dos votos simultáneos no se pisan.
                await db.Reviews.Where(r => r.Id == id)
                    .ExecuteUpdateAsync(u => u.SetProperty(r => r.HelpfulCount, r => r.HelpfulCount + 1), ct);

            var count = await db.Reviews.Where(r => r.Id == id).Select(r => r.HelpfulCount).FirstAsync(ct);
            return Results.Ok(new { helpfulCount = count });
        }).RequireRateLimiting("auth");

        // Denunciar: una vez por persona; a las tres sale de la tienda.
        reviews.MapPost("/{id:guid}/report", async (
            Guid id, ReportReviewRequest req, HttpContext http, ITenantContext tenant, ReviewsDbContext db, CancellationToken ct) =>
        {
            var tid = tenant.TenantId.Value;
            var review = await db.Reviews
                .FirstOrDefaultAsync(r => r.Id == id && r.TenantId == tid && r.Status == ReviewStatus.Approved, ct);
            if (review is null) return Results.NotFound();

            var fingerprint = VisitorFingerprint.Of(http, tid);
            if (await TryVoteAsync(db, ReviewVote.Create(tid, id, ReviewVote.Report, fingerprint, req.Reason), ct))
            {
                review.CountReport();
                await db.SaveChangesAsync(ct);
            }
            return Results.NoContent();
        }).RequireRateLimiting("auth");
    }

    // --------------------------------------------- la cuenta del comprador

    private static void MapShop(RouteGroupBuilder group)
    {
        // El link para opinar desde "Mis compras" (el detalle de cada compra lo
        // muestra como "Opinar"): misma invitación que la del email, para una
        // venta del comprador logueado.
        group.MapGet("/shop/orders/{orderId:guid}/review-invite", async (
            Guid orderId, HttpContext http, ITenantContext tenant, IDataProtectionProvider dp,
            CustomersDbContext customersDb, OrdersDbContext orders, CatalogDbContext catalog,
            ReviewsDbContext db, CancellationToken ct) =>
        {
            var customer = await ShopAuth.ResolveAsync(http, customersDb, ct);
            if (customer is null || string.IsNullOrEmpty(customer.Email)) return Results.Unauthorized();

            var tid = tenant.TenantId.Value;
            var order = await orders.Orders.AsNoTracking()
                .FirstOrDefaultAsync(o => o.Id == orderId && o.TenantId == TenantId.From(tid), ct);
            // Una venta de otro comprador no existe para este.
            if (order is null || !string.Equals(order.BuyerEmail, customer.Email, StringComparison.OrdinalIgnoreCase))
                return Results.NotFound();

            var resolved = await ReviewEligibility.ResolveAsync(tid, orderId, orders, catalog, db, ct);
            if (resolved.IsFailure)
                return Results.Ok(new { eligible = false, reason = resolved.Error.Message, pending = 0, token = (string?)null });

            var pending = resolved.Value.Lines.Count(l => l.ProductId is not null && l.Existing is null);
            return Results.Ok(new
            {
                eligible = true,
                reason = (string?)null,
                pending,
                token = ReviewInviteToken.Protect(dp, tid, orderId),
            });
        }).RequireTenant();
    }

    // ------------------------------------------------------------ el panel

    private static void MapAdmin(RouteGroupBuilder group)
    {
        var admin = group.MapGroup("/admin/reviews").RequireTenant().RequirePermission(Permission.ReviewsManage);

        admin.MapGet("/", async (
            ITenantContext tenant, ReviewsDbContext db, CancellationToken ct,
            string? status = null, int? rating = null, string? q = null, int? offset = null, int? limit = null) =>
        {
            var tid = tenant.TenantId.Value;
            var all = db.Reviews.AsNoTracking().Where(r => r.TenantId == tid);

            var counts = await all
                .GroupBy(r => r.Status)
                .Select(g => new { Status = g.Key, Count = g.Count() })
                .ToListAsync(ct);
            var flagged = await all.CountAsync(r => r.Flagged, ct);

            var query = status?.ToLowerInvariant() switch
            {
                "approved" => all.Where(r => r.Status == ReviewStatus.Approved),
                "hidden" => all.Where(r => r.Status == ReviewStatus.Hidden),
                "all" => all,
                _ => all.Where(r => r.Status == ReviewStatus.Pending),
            };
            if (rating is >= 1 and <= 5) query = query.Where(r => r.Rating == rating);
            if (!string.IsNullOrWhiteSpace(q))
            {
                var term = $"%{q.Trim()}%";
                query = query.Where(r =>
                    EF.Functions.ILike(r.ProductName, term)
                    || EF.Functions.ILike(r.Body, term)
                    || EF.Functions.ILike(r.BuyerEmail, term)
                    || (r.Title != null && EF.Functions.ILike(r.Title, term)));
            }

            // Las denunciadas arriba: son las que más urge mirar.
            var (items, total) = await query
                .OrderByDescending(r => r.Flagged)
                .ThenByDescending(r => r.CreatedAtUtc)
                .ThenBy(r => r.Id)
                .PageAsync(offset, limit, ct, defaultLimit: 25, maxLimit: 100);

            int CountOf(ReviewStatus s) => counts.FirstOrDefault(c => c.Status == s)?.Count ?? 0;
            return Results.Ok(new
            {
                items = items.Select(AdminDto),
                total,
                counts = new
                {
                    pending = CountOf(ReviewStatus.Pending),
                    approved = CountOf(ReviewStatus.Approved),
                    hidden = CountOf(ReviewStatus.Hidden),
                    flagged,
                },
            });
        });

        admin.MapPost("/{id:guid}/approve", (Guid id, ITenantContext tenant, ReviewsDbContext db, CancellationToken ct) =>
            ModerateAsync(id, tenant, db, r => r.Approve(), ct));

        admin.MapPost("/{id:guid}/hide", (Guid id, ITenantContext tenant, ReviewsDbContext db, CancellationToken ct) =>
            ModerateAsync(id, tenant, db, r => r.Hide(), ct));

        // Respuesta pública de la tienda (vacía la borra).
        admin.MapPut("/{id:guid}/reply", async (
            Guid id, ReviewReplyRequest req, ITenantContext tenant, ReviewsDbContext db, CancellationToken ct) =>
        {
            var review = await db.Reviews.FirstOrDefaultAsync(r => r.Id == id && r.TenantId == tenant.TenantId.Value, ct);
            if (review is null) return Results.NotFound();
            var result = review.SetReply(req.Reply);
            if (result.IsFailure) return result.Error.ToProblem();
            await db.SaveChangesAsync(ct);
            return Results.Ok(AdminDto(review));
        });

        admin.MapGet("/settings", async (
            ITenantContext tenant, ReviewsDbContext db, NotificationsDbContext notifications, CancellationToken ct) =>
        {
            var tid = tenant.TenantId.Value;
            var settings = await ProductRatings.SettingsAsync(db, tid, ct);
            return Results.Ok(SettingsDto(settings, await RequestEmailEnabledAsync(notifications, tid, ct)));
        });

        admin.MapPut("/settings", async (
            ReviewSettingsRequest req, ITenantContext tenant, ReviewsDbContext db,
            NotificationsDbContext notifications, CancellationToken ct) =>
        {
            var tid = tenant.TenantId.Value;
            var settings = await db.Settings.FirstOrDefaultAsync(s => s.TenantId == tid, ct);
            var isNew = settings is null;
            settings ??= ReviewSettings.Defaults(tid);

            var result = settings.Update(req.AutoApproveMinRating, req.RequestDelayDays, req.ShowOnStore);
            if (result.IsFailure) return result.Error.ToProblem();
            if (isNew) db.Settings.Add(settings);
            await db.SaveChangesAsync(ct);

            // El email de pedido de reseña es una plantilla más (se edita en
            // E-mails automáticos): prenderlo o apagarlo desde acá es lo mismo.
            if (req.RequestEmailEnabled is { } enabled)
                await SetRequestEmailAsync(notifications, tid, enabled, ct);

            return Results.Ok(SettingsDto(settings, await RequestEmailEnabledAsync(notifications, tid, ct)));
        });
    }

    // ------------------------------------------------------------ helpers

    private static async Task<IResult> ModerateAsync(
        Guid id, ITenantContext tenant, ReviewsDbContext db, Action<ProductReview> action, CancellationToken ct)
    {
        var review = await db.Reviews.FirstOrDefaultAsync(r => r.Id == id && r.TenantId == tenant.TenantId.Value, ct);
        if (review is null) return Results.NotFound();
        action(review);
        await db.SaveChangesAsync(ct);
        return Results.Ok(AdminDto(review));
    }

    /// <summary>
    /// Registra el voto; false si esta persona ya había votado (el índice
    /// único decide aunque lleguen dos a la vez).
    /// </summary>
    private static async Task<bool> TryVoteAsync(ReviewsDbContext db, ReviewVote vote, CancellationToken ct)
    {
        if (await db.Votes.AnyAsync(v => v.ReviewId == vote.ReviewId && v.Kind == vote.Kind && v.Fingerprint == vote.Fingerprint, ct))
            return false;
        db.Votes.Add(vote);
        try
        {
            await db.SaveChangesAsync(ct);
            return true;
        }
        catch (DbUpdateException)
        {
            db.Entry(vote).State = EntityState.Detached;
            return false;
        }
    }

    /// <summary>
    /// Una foto es válida si es una URL pública de NUESTRO storage y de ESTA
    /// tienda: un link a cualquier lado de internet en una reseña es spam (o
    /// peor).
    /// </summary>
    private static bool IsOwnPhoto(MediaOptions media, Guid tenantId, string url)
    {
        var key = media.KeyFromUrl(url);
        return key is not null
            && key.StartsWith($"{tenantId}/", StringComparison.Ordinal)
            && string.Equals(media.PublicUrl(key), url, StringComparison.Ordinal);
    }

    private static async Task<bool> RequestEmailEnabledAsync(NotificationsDbContext db, Guid tenantId, CancellationToken ct)
    {
        var def = EmailTemplateCatalog.Find(ReviewRequestTemplate)!;
        var row = await db.EmailTemplates.AsNoTracking()
            .FirstOrDefaultAsync(t => t.TenantId == tenantId && t.Type == ReviewRequestTemplate, ct);
        return row?.Enabled ?? def.DefaultEnabled;
    }

    private static async Task SetRequestEmailAsync(NotificationsDbContext db, Guid tenantId, bool enabled, CancellationToken ct)
    {
        var row = await db.EmailTemplates.FirstOrDefaultAsync(t => t.TenantId == tenantId && t.Type == ReviewRequestTemplate, ct);
        if (row is null)
        {
            var def = EmailTemplateCatalog.Find(ReviewRequestTemplate)!;
            db.EmailTemplates.Add(EmailTemplate.Create(tenantId, ReviewRequestTemplate, enabled, def.DefaultSubject, def.DefaultBody));
        }
        else
        {
            row.Update(enabled, row.Subject, row.BodyHtml);
        }
        await db.SaveChangesAsync(ct);
    }

    /// <summary>La plantilla del email que pide la reseña (ver ReviewRequestWorker).</summary>
    public const string ReviewRequestTemplate = "pedir-resena";

    private static IResult InvalidLink() =>
        Error.Validation("Review.InvalidLink", "El link para opinar no es válido o ya venció.").ToProblem();

    private static IResult AlreadyReviewed() =>
        Error.Conflict("Review.AlreadyReviewed", "Ya opinaste de este producto en esta compra. ¡Gracias!").ToProblem();

    private static object PublicDto(ProductReview r) => new
    {
        id = r.Id,
        rating = r.Rating,
        title = r.Title,
        body = r.Body,
        authorName = r.AuthorName,
        variantLabel = r.VariantLabel,
        photos = r.Photos,
        // Toda reseña nace de una venta despachada (ver la regla de arriba).
        verified = true,
        helpfulCount = r.HelpfulCount,
        reply = r.Reply,
        repliedAtUtc = r.RepliedAtUtc,
        createdAtUtc = r.CreatedAtUtc,
    };

    private static object AdminDto(ProductReview r) => new
    {
        id = r.Id,
        productId = r.ProductId,
        productName = r.ProductName,
        variantLabel = r.VariantLabel,
        orderId = r.OrderId,
        rating = r.Rating,
        title = r.Title,
        body = r.Body,
        authorName = r.AuthorName,
        buyerEmail = r.BuyerEmail,
        photos = r.Photos,
        status = r.Status.ToString().ToLowerInvariant(),
        reply = r.Reply,
        repliedAtUtc = r.RepliedAtUtc,
        helpfulCount = r.HelpfulCount,
        reportCount = r.ReportCount,
        flagged = r.Flagged,
        createdAtUtc = r.CreatedAtUtc,
        moderatedAtUtc = r.ModeratedAtUtc,
    };

    private static object SettingsDto(ReviewSettings s, bool requestEmailEnabled) => new
    {
        autoApproveMinRating = s.AutoApproveMinRating,
        requestDelayDays = s.RequestDelayDays,
        showOnStore = s.ShowOnStore,
        requestEmailEnabled,
    };
}

public sealed record CreateReviewRequest(
    string? Token, Guid OrderItemId, int Rating, string? Title, string? Body, string[]? Photos, string? Captcha = null);

public sealed record ReportReviewRequest(string? Reason);

public sealed record ReviewReplyRequest(string? Reply);

public sealed record ReviewSettingsRequest(
    int? AutoApproveMinRating, int RequestDelayDays, bool ShowOnStore, bool? RequestEmailEnabled);
