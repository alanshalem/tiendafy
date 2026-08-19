using System.Net;
using System.Security.Cryptography;
using Api.Auth;
using Api.Captcha;
using Api.Notifications;
using Customers.Infrastructure;
using Identity.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;
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
        // kind=repentance = Botón de Arrepentimiento: genera número de constancia
        // en el SERVIDOR y manda un acuse por email al comprador.
        contact.MapPost("/submit", async (
            ContactSubmitRequest req, ITenantContext tenant, ICaptchaVerifier captcha,
            CustomersDbContext db, BrandedEmailSender emails, ILoggerFactory loggerFactory, CancellationToken ct) =>
        {
            if (!await captcha.VerifyAsync(req.Captcha, ct))
                return Results.Problem(title: "Captcha.Failed", detail: "Verificación anti-bots fallida. Reintentá.", statusCode: 400);

            var name = req.Name?.Trim() ?? string.Empty;
            var email = req.Email?.Trim() ?? string.Empty;
            var body = req.Body?.Trim() ?? string.Empty;
            if (name.Length is < 1 or > 120) return Problem("Contact.InvalidName", "Nombre inválido.");
            if (!email.Contains('@') || email.Length > 200) return Problem("Contact.InvalidEmail", "Email inválido.");
            if (body.Length is < 1 or > 4000) return Problem("Contact.InvalidBody", "El mensaje no puede estar vacío.");

            var isRepentance = req.Kind == ContactMessage.KindRepentance;
            var reference = isRepentance ? NewRepentanceReference() : null;

            db.ContactMessages.Add(ContactMessage.Create(
                tenant.TenantId.Value, name, email, body,
                isRepentance ? ContactMessage.KindRepentance : ContactMessage.KindContact,
                reference, req.OrderRef));
            await db.SaveChangesAsync(ct);

            if (isRepentance)
            {
                // Acuse al comprador (constancia por email, además de la de pantalla).
                // Best-effort: si el email falla, la solicitud ya quedó registrada.
                try
                {
                    await emails.SendAsync(tenant.TenantId.Value, email,
                        $"Recibimos tu solicitud de arrepentimiento ({reference})",
                        RepentanceReceiptHtml(name, reference!, req.OrderRef), ct);
                }
                catch (Exception ex)
                {
                    loggerFactory.CreateLogger("Contact").LogWarning(ex,
                        "No se pudo enviar el acuse de arrepentimiento {Reference}.", reference);
                }
            }

            return Results.Ok(new { reference });
        }).RequireRateLimiting("auth");

        // Bandeja del admin (sólo miembros de la tienda). Para las solicitudes de
        // arrepentimiento con número de pedido válido, se resuelve la venta para
        // que el panel muestre "Ver venta".
        contact.MapGet("/messages", async (
            ITenantContext tenant, CustomersDbContext db, IOrderRepository orders, CancellationToken ct,
            int? limit = null, int? offset = null) =>
        {
            var tid = tenant.TenantId.Value;
            var query = db.ContactMessages.AsNoTracking().Where(m => m.TenantId == tid);
            var total = await query.CountAsync(ct);
            var rows = await query
                .OrderByDescending(m => m.CreatedAtUtc)
                .Skip(Math.Max(0, offset ?? 0))
                .Take(Math.Clamp(limit ?? 50, 1, 200))
                .Select(m => new { m.Id, m.Name, m.Email, m.Body, m.Kind, m.Reference, m.OrderRef, m.Read, m.CreatedAtUtc })
                .ToListAsync(ct);

            var items = new List<object>(rows.Count);
            foreach (var m in rows)
            {
                Guid? orderId = null;
                if (m.Kind == ContactMessage.KindRepentance
                    && Guid.TryParse(m.OrderRef, out var candidate)
                    && await orders.GetByIdAsync(tenant.TenantId, candidate, ct) is not null)
                    orderId = candidate;
                items.Add(new
                {
                    m.Id,
                    m.Name,
                    m.Email,
                    m.Body,
                    m.Kind,
                    m.Reference,
                    m.OrderRef,
                    m.Read,
                    m.CreatedAtUtc,
                    OrderId = orderId,
                });
            }
            var unread = rows.Count(m => !m.Read);
            return Results.Ok(new { items, unread, total });
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

    /// <summary>Número de constancia legible: ARR- + 6 caracteres aleatorios sin ambiguos.</summary>
    public static string NewRepentanceReference()
    {
        const string alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
        Span<char> chars = stackalloc char[6];
        for (var i = 0; i < chars.Length; i++)
            chars[i] = alphabet[RandomNumberGenerator.GetInt32(alphabet.Length)];
        return $"ARR-{new string(chars)}";
    }

    private static string RepentanceReceiptHtml(string name, string reference, string? orderRef)
    {
        var pedido = string.IsNullOrWhiteSpace(orderRef)
            ? string.Empty
            : $"<p style='margin:0 0 8px'>Pedido informado: <strong>{WebUtility.HtmlEncode(orderRef.Trim())}</strong></p>";
        return $@"<h2 style='margin:0 0 12px;font-size:20px'>Recibimos tu solicitud de arrepentimiento</h2>
<p style='margin:0 0 8px'>Hola {WebUtility.HtmlEncode(name)},</p>
<p style='margin:0 0 8px'>Registramos tu solicitud con el número de constancia <strong>{reference}</strong> el {DateTime.UtcNow.AddHours(-3):dd/MM/yyyy}.</p>
{pedido}<p style='margin:0 0 8px'>La tienda se va a contactar con vos para coordinar la devolución y el reintegro del pago, sin costo adicional, según el art. 34 de la Ley 24.240 y la Resolución 424/2020.</p>
<p style='color:#8b8b8b;font-size:12px;margin-top:16px'>Guardá este email como constancia.</p>";
    }
}

public sealed record ContactSubmitRequest(
    string Name, string Email, string Body, string? Captcha, string? Kind = null, string? OrderRef = null);
