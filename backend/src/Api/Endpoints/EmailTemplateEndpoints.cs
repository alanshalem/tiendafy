using Api.Auth;
using Ganss.Xss;
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
        var templates = group.MapGroup("/email-templates").RequireTenantMembership();

        // Lista combinada: defaults del catálogo + overrides del tenant.
        templates.MapGet("/", async (ITenantContext tenant, NotificationsDbContext db, CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return Bad();
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
            if (!tenant.HasTenant) return Bad();
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

        return group;
    }

    // Permite el style inline que usan las plantillas de email.
    private static HtmlSanitizer CreateSanitizer()
    {
        var s = new HtmlSanitizer();
        s.AllowedTags.Add("style");
        return s;
    }

    private static IResult Bad() => Results.BadRequest(new { error = "Missing X-Tenant-Id header." });
}

public sealed record EmailTemplateRequest(bool Enabled, string? Subject, string? BodyHtml);
