using Api.Auth;
using Api.Notifications;
using Ganss.Xss;
using Identity.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Notifications.Infrastructure;
using SharedKernel.Abstractions;

namespace Api.Endpoints;

public static class EmailTemplateEndpoints
{
    private static readonly HtmlSanitizer Sanitizer = CreateSanitizer();

    public static RouteGroupBuilder MapEmailTemplateEndpoints(this RouteGroupBuilder group)
    {
        // Grupo 100% admin: plantillas de email del tenant. Exige membresía.
        var templates = group.MapGroup("/email-templates").RequirePermission(Permission.NotificationsConfig);

        // Uso y costo estimado de notificaciones (emails + WhatsApp) del tenant.
        // Tarifas configurables (Notifications:*): son ESTIMACIONES — Resend
        // cobra por plan (Pro USD 20 / 50k emails ≈ 0.40/1000) y Meta por
        // mensaje de plantilla (utility AR ≈ USD 0.034). El front lo aclara.
        group.MapGet("/notifications/usage", async (
            ITenantContext tenant, NotificationsDbContext db, IConfiguration cfg, CancellationToken ct) =>
        {
            var tid = tenant.TenantId.Value;
            var now = DateTime.UtcNow;
            var monthStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);

            var rows = await db.NotificationEvents.AsNoTracking()
                .Where(e => e.TenantId == tid)
                .GroupBy(e => new { e.Channel, EsteMes = e.CreatedAtUtc >= monthStart })
                .Select(g => new { g.Key.Channel, g.Key.EsteMes, Count = g.Count() })
                .ToListAsync(ct);

            int Total(string ch) => rows.Where(r => r.Channel == ch).Sum(r => r.Count);
            int Mes(string ch) => rows.Where(r => r.Channel == ch && r.EsteMes).Sum(r => r.Count);

            var emailPer1000 = NotificationCosts.EmailUsdPer1000(cfg);
            var waPerMessage = cfg.GetValue("Notifications:WhatsAppCostUsdPerMessage", 0.034m);

            return Results.Ok(new
            {
                email = new
                {
                    month = Mes("email"),
                    total = Total("email"),
                    unitUsdPer1000 = emailPer1000,
                    estimatedMonthUsd = Math.Round(Mes("email") * emailPer1000 / 1000m, 2),
                },
                whatsapp = new
                {
                    month = Mes("whatsapp"),
                    total = Total("whatsapp"),
                    unitUsdPerMessage = waPerMessage,
                    estimatedMonthUsd = Math.Round(Mes("whatsapp") * waPerMessage, 2),
                },
            });
        }).RequirePermission(Permission.NotificationsConfig);

        // Lista combinada: defaults del catálogo + overrides del tenant.
        templates.MapGet("/", async (ITenantContext tenant, NotificationsDbContext db, CancellationToken ct) =>
        {
            var tid = tenant.TenantId.Value;
            var overrides = await db.EmailTemplates.AsNoTracking()
                .Where(x => x.TenantId == tid).ToDictionaryAsync(x => x.Type, ct);

            var items = EmailTemplateCatalog.All.Select(def =>
            {
                overrides.TryGetValue(def.Type, out var o);
                return new
                {
                    type = def.Type,
                    group = def.Group,
                    label = def.Label,
                    description = def.Description,
                    enabled = o?.Enabled ?? def.DefaultEnabled,
                    subject = string.IsNullOrWhiteSpace(o?.Subject) ? def.DefaultSubject : o!.Subject,
                    bodyHtml = string.IsNullOrWhiteSpace(o?.BodyHtml) ? def.DefaultBody : o!.BodyHtml,
                };
            });
            return Results.Ok(new { items });
        });

        // Upsert del override de una plantilla.
        templates.MapPut("/{type}", async (string type, EmailTemplateRequest req, ITenantContext tenant, NotificationsDbContext db, CancellationToken ct) =>
        {
            var def = EmailTemplateCatalog.Find(type);
            if (def is null) return Results.NotFound();

            var tid = tenant.TenantId.Value;
            var subject = string.IsNullOrWhiteSpace(req.Subject) ? def.DefaultSubject : req.Subject!.Trim();
            var body = Sanitizer.Sanitize(string.IsNullOrWhiteSpace(req.BodyHtml) ? def.DefaultBody : req.BodyHtml!);

            var row = await db.EmailTemplates.FirstOrDefaultAsync(x => x.TenantId == tid && x.Type == type, ct);
            if (row is null)
            {
                row = EmailTemplate.Create(tid, type, req.Enabled, subject, body);
                db.EmailTemplates.Add(row);
            }
            else
            {
                row.Update(req.Enabled, subject, body);
            }
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { type, enabled = row.Enabled, subject = row.Subject, bodyHtml = row.BodyHtml });
        });

        // Vista previa EXACTA: mismo pipeline que el envío real (sanitizado +
        // variables de ejemplo + layout maestro con el branding del tenant).
        templates.MapPost("/preview", async (
            EmailPreviewRequest req, ITenantContext tenant, BrandedEmailSender branded, CancellationToken ct) =>
        {
            var branding = await branded.ResolveBrandingAsync(tenant.TenantId.Value, ct);

            var vars = new Dictionary<string, string>
            {
                ["store"] = branding.StoreName,
                ["name"] = "Juan Pérez",
                ["order_id"] = "a1b2c3d4-0000-0000-0000-000000000000",
                ["total"] = "ARS 45.381",
                ["email"] = "cliente@ejemplo.com",
                ["link"] = "#",
                ["items"] = SampleItemsTable(),
                ["payment_instructions"] = Api.Orders.OfflinePaymentEmail.Sample(),
            };

            var body = Sanitizer.Sanitize(req.BodyHtml ?? string.Empty);
            return Results.Ok(new
            {
                subject = EmailTemplates.Substitute(req.Subject ?? string.Empty, vars),
                html = EmailLayout.Render(branding, EmailTemplates.Substitute(body, vars)),
            });
        });

        return group;
    }

    // Imagen placeholder (SVG gris inline) para que el preview muestre la tabla
    // de items igual que el email real, que lleva la foto del producto.
    private const string PlaceholderImg =
        "data:image/svg+xml;charset=utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='56'%3E%3Crect width='56' height='56' rx='6' fill='%23e5e5e5'/%3E%3C/svg%3E";

    private static string SampleItemsTable() =>
        "<table role='presentation' style='width:100%;border-collapse:collapse;font-size:14px'>" +
        Row("Remera negra", "Talle M", 2, "ARS 18.000") +
        Row("Gorra", "Única", 1, "ARS 6.500") +
        "<tr><td></td><td style='padding:12px 0 2px;color:#8b8b8b'>Subtotal</td><td style='padding:12px 0 2px;text-align:right'>ARS 24.500</td></tr>" +
        "<tr><td></td><td style='padding:2px 0;color:#8b8b8b'>Envío · Andreani Estándar</td><td style='padding:2px 0;text-align:right'>ARS 8.331</td></tr>" +
        "<tr><td></td><td style='padding:8px 0;font-weight:bold'>Total</td><td style='padding:8px 0;text-align:right;font-weight:bold'>ARS 32.831</td></tr></table>" +
        "<p style='color:#8b8b8b;font-size:13px;margin:10px 0 0'>Entrega: San Martín 1923, Luis Guillón, CP 1838</p>";

    private static string Row(string name, string variant, int qty, string price) =>
        $"<tr style='border-bottom:1px solid #f0f0f0'>" +
        $"<td style='padding:10px 12px 10px 0;width:64px'><img src=\"{PlaceholderImg}\" alt='' width='56' height='56' style='width:56px;height:56px;border-radius:6px;display:block'/></td>" +
        $"<td style='padding:10px 0'>{name}<br/><span style='color:#8b8b8b;font-size:12px'>{variant}</span><br/><span style='color:#8b8b8b;font-size:12px'>x{qty}</span></td>" +
        $"<td style='padding:10px 0;text-align:right;white-space:nowrap;vertical-align:top'>{price}</td></tr>";

    // Permite el style inline que usan las plantillas de email.
    private static HtmlSanitizer CreateSanitizer()
    {
        var s = new HtmlSanitizer();
        s.AllowedTags.Add("style");
        return s;
    }

}

public sealed record EmailPreviewRequest(string? Subject, string? BodyHtml);

public sealed record EmailTemplateRequest(bool Enabled, string? Subject, string? BodyHtml);
