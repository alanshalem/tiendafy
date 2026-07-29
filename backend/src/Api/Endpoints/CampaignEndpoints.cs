using Api.Auth;
using Api.Notifications;
using Identity.Infrastructure;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Notifications.Infrastructure;
using Orders.Infrastructure.Persistence;
using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace Api.Endpoints;

/// <summary>
/// Email marketing por tienda: campañas masivas a compradores o contactos.
/// Reglas no negociables: la audiencia se filtra SIEMPRE contra la lista de
/// supresión, y cada email lleva link de baja firmado (lo agrega el worker).
/// El envío es en background (CampaignWorker) por lotes.
/// </summary>
public static class CampaignEndpoints
{
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
            var campaign = EmailCampaign.Create(tenant.TenantId.Value, req.Subject!, req.BodyHtml!, req.Audience ?? "buyers");
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
            if (!campaign.IsDraft)
                return Error.Conflict("Campaign.NotDraft", "Solo se pueden editar borradores.").ToProblem();
            var check = Validate(req);
            if (check is not null) return check;
            campaign.UpdateDraft(req.Subject!, req.BodyHtml!, req.Audience ?? campaign.Audience);
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

        // Tamaño de audiencia (ya filtrada por supresión) para el selector.
        admin.MapGet("/audience-count", async (
            string? type, ITenantContext tenant, NotificationsDbContext db, OrdersDbContext orders,
            Customers.Infrastructure.CustomersDbContext customers, CancellationToken ct) =>
        {
            var emails = await ResolveAudienceAsync(
                tenant.TenantId, type ?? "buyers", db, orders, customers, ct);
            return Results.Ok(new { count = emails.Count });
        });

        // Envío de prueba: UN email a la dirección indicada, con el footer de
        // baja real, sin tocar el estado de la campaña.
        admin.MapPost("/{id:guid}/test", async (
            Guid id, CampaignTestRequest req, ITenantContext tenant, NotificationsDbContext db,
            BrandedEmailSender email, IDataProtectionProvider dp, IConfiguration cfg, CancellationToken ct) =>
        {
            var campaign = await db.EmailCampaigns.AsNoTracking()
                .FirstOrDefaultAsync(c => c.TenantId == tenant.TenantId.Value && c.Id == id, ct);
            if (campaign is null) return Results.NotFound();
            var to = req.Email?.Trim();
            if (string.IsNullOrEmpty(to) || !to.Contains('@'))
                return Error.Validation("Campaign.InvalidEmail", "Ingresá un email válido para la prueba.").ToProblem();

            var apiBase = cfg["PublicApiBaseUrl"] ?? "http://localhost:5080";
            var token = UnsubscribeToken.Protect(dp, tenant.TenantId.Value, to);
            var body = campaign.BodyHtml + TestFooter($"{apiBase}/api/v1/marketing/unsubscribe?token={Uri.EscapeDataString(token)}");
            await email.SendAsync(tenant.TenantId.Value, to, $"[PRUEBA] {campaign.Subject}", body, ct, template: "campaign-test");
            return Results.Ok(new { ok = true });
        });

        // Enviar: snapshotea la audiencia (menos suprimidos) y pasa a "sending".
        // El CampaignWorker hace el resto en background.
        admin.MapPost("/{id:guid}/send", async (
            Guid id, ITenantContext tenant, NotificationsDbContext db, OrdersDbContext orders,
            Customers.Infrastructure.CustomersDbContext customers, CancellationToken ct) =>
        {
            var campaign = await db.EmailCampaigns
                .FirstOrDefaultAsync(c => c.TenantId == tenant.TenantId.Value && c.Id == id, ct);
            if (campaign is null) return Results.NotFound();
            if (!campaign.IsDraft)
                return Error.Conflict("Campaign.NotDraft", "Esta campaña ya fue enviada o cancelada.").ToProblem();

            var emails = await ResolveAudienceAsync(tenant.TenantId, campaign.Audience, db, orders, customers, ct);
            if (emails.Count == 0)
                return Error.Validation("Campaign.EmptyAudience",
                    "La audiencia está vacía: todavía no hay destinatarios para esta campaña.").ToProblem();

            foreach (var address in emails)
                db.CampaignRecipients.Add(CampaignRecipient.Create(tenant.TenantId.Value, campaign.Id, address));
            campaign.StartSending(emails.Count);
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
            // Los pending que queden no se envían (el worker solo procesa "sending").
            await db.SaveChangesAsync(ct);
            return Results.Ok(Dto(campaign));
        });

        // ------------------------------------------ Público: baja de campañas
        // GET = página de confirmación (los prefetchers de los clientes de mail
        // abren links solos: la baja NO puede ejecutarse en el GET).
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
                db.EmailSuppressions.Add(EmailSuppression.Create(payload.TenantId, payload.Email, "unsubscribe"));
                await db.SaveChangesAsync(ct);
            }
            return Results.Content(Page("Listo",
                "<p>No vas a recibir más emails de novedades de esta tienda.</p>"), "text/html");
        });

        return group;
    }

    // ---------------------------------------------------------------- Helpers

    /// <summary>
    /// Emails únicos de la audiencia, ya filtrados por la lista de supresión.
    /// buyers: compró alguna vez (orden con pago acreditado).
    /// customers: cualquier contacto con email (incluye compradores).
    /// </summary>
    private static async Task<IReadOnlyList<string>> ResolveAudienceAsync(
        TenantId tenantId, string audience, NotificationsDbContext db, OrdersDbContext orders,
        Customers.Infrastructure.CustomersDbContext customers, CancellationToken ct)
    {
        var buyerEmails = await orders.Orders.AsNoTracking()
            .Where(o => o.TenantId == tenantId && o.PaidAtUtc != null)
            .Select(o => o.BuyerEmail)
            .Distinct()
            .ToListAsync(ct);

        IEnumerable<string> emails = buyerEmails;
        if (audience == "customers")
        {
            var contactEmails = await customers.Customers.AsNoTracking()
                .Where(c => c.TenantId == tenantId.Value && c.Email != null)
                .Select(c => c.Email!)
                .ToListAsync(ct);
            emails = buyerEmails.Concat(contactEmails);
        }

        var suppressed = (await db.EmailSuppressions.AsNoTracking()
            .Where(s => s.TenantId == tenantId.Value)
            .Select(s => s.Email)
            .ToListAsync(ct)).ToHashSet(StringComparer.OrdinalIgnoreCase);

        return emails
            .Where(e => !string.IsNullOrWhiteSpace(e) && e.Contains('@'))
            .Select(e => e.Trim().ToLowerInvariant())
            .Distinct()
            .Where(e => !suppressed.Contains(e))
            .OrderBy(e => e, StringComparer.Ordinal)
            .ToList();
    }

    private static IResult? Validate(CampaignRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Subject) || req.Subject.Trim().Length > 200)
            return Error.Validation("Campaign.InvalidSubject", "El asunto es obligatorio (hasta 200 caracteres).").ToProblem();
        if (string.IsNullOrWhiteSpace(req.BodyHtml))
            return Error.Validation("Campaign.EmptyBody", "El contenido no puede estar vacío.").ToProblem();
        return null;
    }

    private static object Dto(EmailCampaign c) => new
    {
        c.Id,
        c.Subject,
        c.BodyHtml,
        c.Audience,
        c.Status,
        c.RecipientCount,
        c.SentCount,
        c.FailedCount,
        c.CreatedAtUtc,
        c.SentAtUtc,
    };

    private static string TestFooter(string url) => $"""
        <p style="margin-top:32px;padding-top:16px;border-top:1px solid #e4e4e7;font-size:12px;color:#a1a1aa;text-align:center">
          Recibís este email porque compraste o te registraste en esta tienda.
          <a href="{url}" style="color:#a1a1aa;text-decoration:underline">Dejar de recibir novedades</a>
        </p>
        """;

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

public sealed record CampaignRequest(string? Subject, string? BodyHtml, string? Audience);

public sealed record CampaignTestRequest(string? Email);
