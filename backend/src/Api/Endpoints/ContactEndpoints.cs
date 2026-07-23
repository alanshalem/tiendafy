using Identity.Infrastructure;
using Api.Auth;
using Api.Captcha;
using Customers.Infrastructure;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;

namespace Api.Endpoints;

public static class ContactEndpoints
{
    public static RouteGroupBuilder MapContactEndpoints(this RouteGroupBuilder group)
    {
        // Config pública del captcha (la consumen storefront y admin para el widget).
        group.MapGet("/captcha/config", (ICaptchaVerifier captcha) =>
            Results.Ok(new { enabled = captcha.Enabled, siteKey = captcha.SiteKey }));

        var contact = group.MapGroup("/contact").RequireTenant();

        // Envío público del formulario (anónimo). Tenant por X-Tenant-Id + captcha.
        contact.MapPost("/submit", async (ContactSubmitRequest req, ITenantContext tenant, ICaptchaVerifier captcha, CustomersDbContext db, CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return AuthExtensions.MissingTenant();
            if (!await captcha.VerifyAsync(req.Captcha, ct))
                return Results.Problem(title: "Captcha.Failed", detail: "Verificación anti-bots fallida. Reintentá.", statusCode: 400);

            var name = req.Name?.Trim() ?? string.Empty;
            var email = req.Email?.Trim() ?? string.Empty;
            var body = req.Body?.Trim() ?? string.Empty;
            if (name.Length is < 1 or > 120) return Problem("Contact.InvalidName", "Nombre inválido.");
            if (!email.Contains('@') || email.Length > 200) return Problem("Contact.InvalidEmail", "Email inválido.");
            if (body.Length is < 1 or > 4000) return Problem("Contact.InvalidBody", "El mensaje no puede estar vacío.");

            db.ContactMessages.Add(ContactMessage.Create(tenant.TenantId.Value, name, email, body));
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        }).RequireRateLimiting("auth");

        // Bandeja del admin (sólo miembros de la tienda).
        contact.MapGet("/messages", async (ITenantContext tenant, CustomersDbContext db, CancellationToken ct) =>
        {
            var tid = tenant.TenantId.Value;
            var items = await db.ContactMessages.AsNoTracking()
                .Where(m => m.TenantId == tid)
                .OrderByDescending(m => m.CreatedAtUtc)
                .Select(m => new { m.Id, m.Name, m.Email, m.Body, m.Read, m.CreatedAtUtc })
                .ToListAsync(ct);
            var unread = items.Count(m => !m.Read);
            return Results.Ok(new { items, unread });
        }).RequirePermission(Permission.MessagesRead);

        // Marcar leído.
        contact.MapPost("/messages/{id:guid}/read", async (Guid id, ITenantContext tenant, CustomersDbContext db, CancellationToken ct) =>
        {
            var tid = tenant.TenantId.Value;
            var msg = await db.ContactMessages.FirstOrDefaultAsync(m => m.Id == id && m.TenantId == tid, ct);
            if (msg is null) return Results.NotFound();
            msg.MarkRead();
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        }).RequirePermission(Permission.MessagesRead);

        return group;
    }

    private static IResult Problem(string title, string detail) => Results.Problem(title: title, detail: detail, statusCode: 400);
}

public sealed record ContactSubmitRequest(string Name, string Email, string Body, string? Captcha);
