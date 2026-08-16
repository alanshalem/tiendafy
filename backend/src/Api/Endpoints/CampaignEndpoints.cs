using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Api.Auth;
using Api.Notifications;
using Identity.Infrastructure;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Notifications.Infrastructure;
using Orders.Infrastructure.Persistence;
using SharedKernel.Abstractions;
using SharedKernel.Common;
using Tenancy.Infrastructure.Persistence;

namespace Api.Endpoints;

/// <summary>
/// Email marketing por tienda: campañas con audiencias segmentadas (gasto,
/// compras, recencia o selección manual), preview brandeada, cupón con
/// atribución de ingresos, programación, tracking de apertura/clicks y baja
/// obligatoria. El envío corre en background (CampaignWorker).
/// </summary>
public static class CampaignEndpoints
{
    private static readonly byte[] PixelGif = Convert.FromBase64String(
        "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7");

    public static RouteGroupBuilder MapCampaignEndpoints(this RouteGroupBuilder group)
    {
        var admin = group.MapGroup("/admin/campaigns").RequirePermission(Permission.SettingsWrite);

        admin.MapGet("/", async (ITenantContext tenant, NotificationsDbContext db, CancellationToken ct) =>
        {
            var items = await db.EmailCampaigns.AsNoTracking()
                .Where(c => c.TenantId == tenant.TenantId.Value)
                .OrderByDescending(c => c.CreatedAtUtc)
                .Take(100)
                .ToListAsync(ct);
            return Results.Ok(new { items = items.Select(Dto) });
        });

        admin.MapPost("/", async (
            CampaignRequest req, ITenantContext tenant, NotificationsDbContext db, CancellationToken ct) =>
        {
            var check = Validate(req);
            if (check is not null) return check;
            var campaign = EmailCampaign.Create(tenant.TenantId.Value, req.Subject!, req.BodyHtml!,
                req.Audience ?? "buyers", SpecJson(req), req.CouponCode, ProductsJson(req));
            db.EmailCampaigns.Add(campaign);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/admin/campaigns/{campaign.Id}", Dto(campaign));
        });

        admin.MapPut("/{id:guid}", async (
            Guid id, CampaignRequest req, ITenantContext tenant, NotificationsDbContext db, CancellationToken ct) =>
        {
            var campaign = await db.EmailCampaigns
                .FirstOrDefaultAsync(c => c.TenantId == tenant.TenantId.Value && c.Id == id, ct);
            if (campaign is null) return Results.NotFound();
            if (!campaign.IsDraft && !campaign.IsScheduled)
                return Error.Conflict("Campaign.NotDraft", "Solo se pueden editar borradores o programadas.").ToProblem();
            var check = Validate(req);
            if (check is not null) return check;
            campaign.UpdateDraft(req.Subject!, req.BodyHtml!, req.Audience ?? campaign.Audience,
                SpecJson(req), req.CouponCode, ProductsJson(req));
            await db.SaveChangesAsync(ct);
            return Results.Ok(Dto(campaign));
        });

        admin.MapDelete("/{id:guid}", async (
            Guid id, ITenantContext tenant, NotificationsDbContext db, CancellationToken ct) =>
        {
            var campaign = await db.EmailCampaigns
                .FirstOrDefaultAsync(c => c.TenantId == tenant.TenantId.Value && c.Id == id, ct);
            if (campaign is null) return Results.NoContent();
            if (campaign.IsSending)
                return Error.Conflict("Campaign.Sending", "Cancelá la campaña antes de borrarla.").ToProblem();
            db.EmailCampaigns.Remove(campaign);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        // Audiencia resuelta (conteo + muestra) para el builder del modal.
        admin.MapPost("/audience/preview", async (
            AudiencePreviewRequest req, ITenantContext tenant, CampaignAudienceService audience, CancellationToken ct) =>
        {
            var spec = new AudienceSpec(req.Type ?? "buyers", req.MinSpentMinor, req.MinOrders,
                req.PurchasedWithinDays, req.InactiveForDays, req.Emails);
            var members = await audience.ResolveAsync(tenant.TenantId, spec, ct);
            return Results.Ok(new
            {
                count = members.Count,
                sample = members.Take(200).Select(m => new
                {
                    m.Email,
                    m.Name,
                    spentMinor = m.SpentMinor,
                    orders = m.Orders,
                    lastPurchaseUtc = m.LastPurchaseUtc,
                }),
            });
        });

        // Preview brandeada: el HTML EXACTO que recibe el cliente (layout de la
        // tienda + productos + footer de baja), sin tracking.
        admin.MapPost("/preview", async (
            CampaignRequest req, ITenantContext tenant, BrandedEmailSender email,
            TenancyDbContext tenancy, IConfiguration cfg, CancellationToken ct) =>
        {
            var branding = await email.ResolveBrandingAsync(tenant.TenantId.Value, ct);
            var platform = (cfg["Tenancy:PlatformBaseDomain"] ?? "localhost:3000").ToLowerInvariant();
            var t = await tenancy.Tenants.AsNoTracking().FirstOrDefaultAsync(x => x.Id == tenant.TenantId.Value, ct);
            var storeBase = t is null
                ? $"http://{platform}"
                : StoreUrls.For(t.CustomDomain, t.Subdomain.Value, platform);
            var products = CampaignEmailComposer.ParseProducts(ProductsJson(req));
            var body = CampaignEmailComposer.ComposeForPreview(req.BodyHtml ?? string.Empty, products, storeBase);
            return Results.Ok(new
            {
                subject = req.Subject ?? string.Empty,
                html = EmailLayout.Render(branding, body),
            });
        });

        // Detalle con métricas: progreso, aperturas/clicks, bajas, costo y
        // atribución de ingresos por cupón.
        admin.MapGet("/{id:guid}", async (
            Guid id, ITenantContext tenant, NotificationsDbContext db, OrdersDbContext orders,
            IConfiguration cfg, CancellationToken ct) =>
        {
            var campaign = await db.EmailCampaigns.AsNoTracking()
                .FirstOrDefaultAsync(c => c.TenantId == tenant.TenantId.Value && c.Id == id, ct);
            if (campaign is null) return Results.NotFound();

            var recipients = await db.CampaignRecipients.AsNoTracking()
                .Where(r => r.CampaignId == id)
                .ToListAsync(ct);
            var opened = recipients.Count(r => r.OpenedAtUtc != null);
            var clicked = recipients.Count(r => r.ClickedAtUtc != null);
            var failedEmails = recipients.Where(r => r.Status == "failed").Select(r => r.Email).Take(20).ToList();

            var unsubs = await db.EmailSuppressions.AsNoTracking()
                .CountAsync(s => s.TenantId == tenant.TenantId.Value && s.CampaignId == id, ct);

            var ratePer1000 = NotificationCosts.EmailUsdPer1000(cfg);
            var estimatedCostUsd = Math.Round(campaign.SentCount * ratePer1000 / 1000m, 2);

            object? attribution = null;
            if (!string.IsNullOrEmpty(campaign.CouponCode) && campaign.SentAtUtc is { } sentAt)
            {
                var attributed = await orders.Orders.AsNoTracking()
                    .Where(o => o.TenantId == tenant.TenantId && o.PaidAtUtc >= sentAt
                        && o.CouponCode == campaign.CouponCode)
                    .ToListAsync(ct);
                attribution = new
                {
                    orders = attributed.Count,
                    revenueMinor = attributed.Sum(o => o.Total.AmountInMinorUnits),
                    currency = attributed.Count > 0 ? attributed[0].Currency : Money.DefaultCurrency,
                    couponCode = campaign.CouponCode,
                };
            }

            return Results.Ok(new
            {
                campaign = Dto(campaign),
                stats = new
                {
                    sent = campaign.SentCount,
                    failed = campaign.FailedCount,
                    pending = recipients.Count(r => r.Status == "pending"),
                    opened,
                    clicked,
                    unsubs,
                    estimatedCostUsd,
                },
                failedEmails,
                attribution,
            });
        });

        // Envío de prueba (sin tracking, footer real de ejemplo).
        admin.MapPost("/{id:guid}/test", async (
            Guid id, CampaignTestRequest req, ITenantContext tenant, NotificationsDbContext db,
            BrandedEmailSender email, IDataProtectionProvider dp, IConfiguration cfg,
            TenancyDbContext tenancy, CancellationToken ct) =>
        {
            var campaign = await db.EmailCampaigns.AsNoTracking()
                .FirstOrDefaultAsync(c => c.TenantId == tenant.TenantId.Value && c.Id == id, ct);
            if (campaign is null) return Results.NotFound();
            var to = req.Email?.Trim();
            if (string.IsNullOrEmpty(to) || !to.Contains('@'))
                return Error.Validation("Campaign.InvalidEmail", "Ingresá un email válido para la prueba.").ToProblem();

            var apiBase = cfg["PublicApiBaseUrl"] ?? "http://localhost:5080";
            var platform = (cfg["Tenancy:PlatformBaseDomain"] ?? "localhost:3000").ToLowerInvariant();
            var t = await tenancy.Tenants.AsNoTracking().FirstOrDefaultAsync(x => x.Id == tenant.TenantId.Value, ct);
            var storeBase = t is null
                ? $"http://{platform}"
                : StoreUrls.For(t.CustomDomain, t.Subdomain.Value, platform);
            var token = UnsubscribeToken.Protect(dp, tenant.TenantId.Value, to);
            var products = CampaignEmailComposer.ParseProducts(campaign.ProductsJson);
            var body = CampaignEmailComposer.ComposeForPreview(campaign.BodyHtml, products, storeBase)
                .Replace("href=\"#\"", $"href=\"{apiBase}/api/v1/marketing/unsubscribe?token={Uri.EscapeDataString(token)}\"");
            await email.SendAsync(tenant.TenantId.Value, to, $"[PRUEBA] {campaign.Subject}", body, ct, template: "campaign-test");
            return Results.Ok(new { ok = true });
        });

        // Enviar YA o programar. Envío inmediato: snapshotea la audiencia acá.
        admin.MapPost("/{id:guid}/send", async (
            Guid id, CampaignSendRequest? req, ITenantContext tenant, NotificationsDbContext db,
            CampaignAudienceService audience, CancellationToken ct) =>
        {
            var campaign = await db.EmailCampaigns
                .FirstOrDefaultAsync(c => c.TenantId == tenant.TenantId.Value && c.Id == id, ct);
            if (campaign is null) return Results.NotFound();
            if (!campaign.IsDraft && !campaign.IsScheduled)
                return Error.Conflict("Campaign.NotDraft", "Esta campaña ya fue enviada o cancelada.").ToProblem();

            if (req?.ScheduleAtUtc is { } when)
            {
                if (when <= DateTime.UtcNow.AddMinutes(1))
                    return Error.Validation("Campaign.InvalidSchedule",
                        "La fecha de programación tiene que ser en el futuro.").ToProblem();
                campaign.Schedule(when);
                await db.SaveChangesAsync(ct);
                return Results.Ok(Dto(campaign));
            }

            var spec = AudienceSpec.Parse(campaign.AudienceJson, campaign.Audience);
            var members = await audience.ResolveAsync(tenant.TenantId, spec, ct);
            if (members.Count == 0)
                return Error.Validation("Campaign.EmptyAudience",
                    "La audiencia está vacía: ajustá los filtros o esperá a tener destinatarios.").ToProblem();

            foreach (var member in members)
                db.CampaignRecipients.Add(CampaignRecipient.Create(tenant.TenantId.Value, campaign.Id, member.Email));
            campaign.StartSending(members.Count);
            await db.SaveChangesAsync(ct);
            return Results.Ok(Dto(campaign));
        });

        admin.MapPost("/{id:guid}/cancel", async (
            Guid id, ITenantContext tenant, NotificationsDbContext db, CancellationToken ct) =>
        {
            var campaign = await db.EmailCampaigns
                .FirstOrDefaultAsync(c => c.TenantId == tenant.TenantId.Value && c.Id == id, ct);
            if (campaign is null) return Results.NotFound();
            campaign.Cancel();
            await db.SaveChangesAsync(ct);
            return Results.Ok(Dto(campaign));
        });

        // Duplicar: nueva campaña en borrador con el mismo contenido.
        admin.MapPost("/{id:guid}/duplicate", async (
            Guid id, ITenantContext tenant, NotificationsDbContext db, CancellationToken ct) =>
        {
            var source = await db.EmailCampaigns.AsNoTracking()
                .FirstOrDefaultAsync(c => c.TenantId == tenant.TenantId.Value && c.Id == id, ct);
            if (source is null) return Results.NotFound();
            var copy = EmailCampaign.Create(tenant.TenantId.Value, $"{source.Subject} (copia)",
                source.BodyHtml, source.Audience, source.AudienceJson, source.CouponCode, source.ProductsJson);
            db.EmailCampaigns.Add(copy);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/admin/campaigns/{copy.Id}", Dto(copy));
        });

        // ------------------------------------------ Público: baja de campañas
        group.MapGet("/marketing/unsubscribe", (string? token, IDataProtectionProvider dp) =>
        {
            var payload = token is null ? null : UnsubscribeToken.Unprotect(dp, token);
            if (payload is null)
                return Results.Content(Page("Link inválido",
                    "<p>El link de baja no es válido o está incompleto.</p>"), "text/html");
            return Results.Content(Page("Dejar de recibir novedades", $"""
                <p>¿Querés dejar de recibir emails de novedades y promociones de esta tienda?</p>
                <p style="color:#71717a;font-size:14px">Los emails de tus compras (confirmaciones, envíos) van a seguir llegando normalmente.</p>
                <form method="post" action="/api/v1/marketing/unsubscribe?token={Uri.EscapeDataString(token!)}">
                  <button type="submit" style="background:#18181b;color:#fff;border:0;padding:12px 24px;border-radius:8px;font-size:15px;cursor:pointer">Sí, darme de baja</button>
                </form>
                """), "text/html");
        });

        group.MapPost("/marketing/unsubscribe", async (
            string? token, IDataProtectionProvider dp, NotificationsDbContext db, CancellationToken ct) =>
        {
            var payload = token is null ? null : UnsubscribeToken.Unprotect(dp, token);
            if (payload is null)
                return Results.Content(Page("Link inválido",
                    "<p>El link de baja no es válido o está incompleto.</p>"), "text/html");

            var exists = await db.EmailSuppressions
                .AnyAsync(s => s.TenantId == payload.TenantId && s.Email == payload.Email, ct);
            if (!exists)
            {
                db.EmailSuppressions.Add(EmailSuppression.Create(
                    payload.TenantId, payload.Email, "unsubscribe", payload.CampaignId));
                await db.SaveChangesAsync(ct);
            }
            return Results.Content(Page("Listo",
                "<p>No vas a recibir más emails de novedades de esta tienda.</p>"), "text/html");
        });

        // ----------------------------------- Público: tracking de campañas
        // Pixel de apertura (1×1 gif). GET sin efectos visibles al usuario.
        group.MapGet("/marketing/o.gif", async (
            string? t, IDataProtectionProvider dp, NotificationsDbContext db, CancellationToken ct) =>
        {
            var payload = t is null ? null : TrackToken.Unprotect(dp, t);
            if (payload is not null)
            {
                var recipient = await db.CampaignRecipients.FirstOrDefaultAsync(
                    r => r.CampaignId == payload.CampaignId && r.Email == payload.Email, ct);
                if (recipient is not null && recipient.OpenedAtUtc is null)
                {
                    recipient.MarkOpened();
                    await db.SaveChangesAsync(ct);
                }
            }
            return Results.File(PixelGif, "image/gif");
        });

        // Redirect de click trackeado. Solo destinos http(s).
        group.MapGet("/marketing/c", async (
            string? t, string? u, IDataProtectionProvider dp, NotificationsDbContext db, CancellationToken ct) =>
        {
            if (string.IsNullOrEmpty(u) || !Uri.TryCreate(u, UriKind.Absolute, out var target)
                || (target.Scheme != Uri.UriSchemeHttp && target.Scheme != Uri.UriSchemeHttps))
                return Results.BadRequest();

            var payload = t is null ? null : TrackToken.Unprotect(dp, t);
            if (payload is not null)
            {
                var recipient = await db.CampaignRecipients.FirstOrDefaultAsync(
                    r => r.CampaignId == payload.CampaignId && r.Email == payload.Email, ct);
                if (recipient is not null && recipient.ClickedAtUtc is null)
                {
                    recipient.MarkClicked();
                    await db.SaveChangesAsync(ct);
                }
            }
            return Results.Redirect(target.ToString());
        });

        // ------------------------- Webhook de Resend: bounces y quejas → supresión
        // Protege la reputación: un rebote duro reenviado hunde la entregabilidad.
        // Firma svix (secret whsec_ en Email:WebhookSecret); sin secret, 404.
        group.MapPost("/webhooks/resend", async (
            HttpRequest http, IConfiguration cfg, NotificationsDbContext db,
            ILoggerFactory lf, CancellationToken ct) =>
        {
            var secret = cfg["Email:WebhookSecret"];
            if (string.IsNullOrEmpty(secret)) return Results.NotFound();

            using var reader = new StreamReader(http.Body);
            var body = await reader.ReadToEndAsync(ct);
            if (!VerifySvix(secret, http.Headers["svix-id"], http.Headers["svix-timestamp"],
                    http.Headers["svix-signature"], body))
                return Results.Unauthorized();

            try
            {
                using var doc = JsonDocument.Parse(body);
                var type = doc.RootElement.GetProperty("type").GetString();
                if (type is not ("email.bounced" or "email.complained")) return Results.Ok();

                var data = doc.RootElement.GetProperty("data");
                var tenantId = ExtractTenantTag(data);
                if (tenantId is null) return Results.Ok(); // email viejo sin tag: no se puede atribuir

                var reason = type == "email.bounced" ? "bounce" : "complaint";
                if (data.TryGetProperty("to", out var toProp))
                {
                    var targets = toProp.ValueKind == JsonValueKind.Array
                        ? toProp.EnumerateArray().Select(e => e.GetString()).ToList()
                        : [toProp.GetString()];
                    foreach (var address in targets.Where(a => !string.IsNullOrWhiteSpace(a)))
                    {
                        var normalized = address!.Trim().ToLowerInvariant();
                        var exists = await db.EmailSuppressions.AnyAsync(
                            s => s.TenantId == tenantId && s.Email == normalized, ct);
                        if (!exists)
                            db.EmailSuppressions.Add(EmailSuppression.Create(tenantId.Value, normalized, reason));
                    }
                    await db.SaveChangesAsync(ct);
                }
                return Results.Ok();
            }
            catch (Exception ex) when (ex is JsonException or KeyNotFoundException)
            {
                lf.CreateLogger("ResendWebhook").LogWarning(ex, "Webhook de Resend con payload inesperado.");
                return Results.Ok(); // no reintentar payloads malformados
            }
        });

        return group;
    }

    // ---------------------------------------------------------------- Helpers

    /// <summary>Verificación de firma svix: HMAC-SHA256 de "{id}.{timestamp}.{payload}".</summary>
    public static bool VerifySvix(string secret, string? id, string? timestamp, string? signatureHeader, string payload)
    {
        if (string.IsNullOrEmpty(id) || string.IsNullOrEmpty(timestamp) || string.IsNullOrEmpty(signatureHeader))
            return false;
        var key = Convert.FromBase64String(secret.StartsWith("whsec_", StringComparison.Ordinal) ? secret[6..] : secret);
        using var hmac = new HMACSHA256(key);
        var expected = Convert.ToBase64String(hmac.ComputeHash(Encoding.UTF8.GetBytes($"{id}.{timestamp}.{payload}")));
        // Header: "v1,<base64> v1,<base64> ..." — alcanza con que una coincida.
        return signatureHeader.Split(' ')
            .Select(part => part.Split(',', 2))
            .Any(parts => parts.Length == 2 && parts[0] == "v1"
                && CryptographicOperations.FixedTimeEquals(
                    Encoding.UTF8.GetBytes(parts[1]), Encoding.UTF8.GetBytes(expected)));
    }

    /// <summary>El tag "tenant" del envío (objeto o array, según versión del payload).</summary>
    private static Guid? ExtractTenantTag(JsonElement data)
    {
        if (!data.TryGetProperty("tags", out var tags)) return null;
        string? value = null;
        if (tags.ValueKind == JsonValueKind.Object && tags.TryGetProperty("tenant", out var v))
            value = v.GetString();
        else if (tags.ValueKind == JsonValueKind.Array)
            foreach (var tag in tags.EnumerateArray())
                if (tag.TryGetProperty("name", out var n) && n.GetString() == "tenant"
                    && tag.TryGetProperty("value", out var val))
                    value = val.GetString();
        return Guid.TryParse(value, out var g) ? g : null;
    }

    private static string? SpecJson(CampaignRequest req) =>
        new AudienceSpec(req.Audience ?? "buyers", req.MinSpentMinor, req.MinOrders,
            req.PurchasedWithinDays, req.InactiveForDays, req.Emails).Serialize();

    private static string? ProductsJson(CampaignRequest req) =>
        req.Products is { Count: > 0 }
            ? JsonSerializer.Serialize(req.Products, CampaignEmailComposer.Json)
            : null;

    private static IResult? Validate(CampaignRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Subject) || req.Subject.Trim().Length > 200)
            return Error.Validation("Campaign.InvalidSubject", "El asunto es obligatorio (hasta 200 caracteres).").ToProblem();
        if (string.IsNullOrWhiteSpace(req.BodyHtml))
            return Error.Validation("Campaign.EmptyBody", "El contenido no puede estar vacío.").ToProblem();
        if (req.Audience == "custom" && (req.Emails is null || req.Emails.Count == 0))
            return Error.Validation("Campaign.EmptyCustom", "Elegí al menos un destinatario.").ToProblem();
        return null;
    }

    private static object Dto(EmailCampaign c) => new
    {
        c.Id,
        c.Subject,
        c.BodyHtml,
        c.Audience,
        audienceSpec = AudienceSpec.Parse(c.AudienceJson, c.Audience),
        c.CouponCode,
        products = CampaignEmailComposer.ParseProducts(c.ProductsJson),
        c.Status,
        c.ScheduledAtUtc,
        c.RecipientCount,
        c.SentCount,
        c.FailedCount,
        c.CreatedAtUtc,
        c.SentAtUtc,
    };

    private static string Page(string title, string bodyHtml) => $"""
        <!DOCTYPE html>
        <html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
        <title>{title}</title></head>
        <body style="margin:0;background:#fafafa;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#18181b">
          <div style="max-width:440px;margin:80px auto;background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:32px;text-align:center">
            <h1 style="font-size:20px;margin:0 0 12px">{title}</h1>
            {bodyHtml}
          </div>
        </body></html>
        """;
}

public sealed record CampaignRequest(
    string? Subject,
    string? BodyHtml,
    string? Audience,
    long? MinSpentMinor = null,
    int? MinOrders = null,
    int? PurchasedWithinDays = null,
    int? InactiveForDays = null,
    List<string>? Emails = null,
    string? CouponCode = null,
    List<CampaignProduct>? Products = null);

public sealed record AudiencePreviewRequest(
    string? Type,
    long? MinSpentMinor = null,
    int? MinOrders = null,
    int? PurchasedWithinDays = null,
    int? InactiveForDays = null,
    List<string>? Emails = null);

public sealed record CampaignTestRequest(string? Email);

public sealed record CampaignSendRequest(DateTime? ScheduleAtUtc);
