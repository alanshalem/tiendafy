using System.Net;
using System.Security.Cryptography;
using Api.Auth;
using Api.Captcha;
using Api.Notifications;
using Api.Shop;
using Customers.Infrastructure;
using Identity.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;
using SharedKernel.Abstractions;
using SharedKernel.Common;

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
            var (rows, total) = await query
                .OrderByDescending(m => m.CreatedAtUtc)
                .Select(m => new { m.Id, m.Name, m.Email, m.Body, m.Kind, m.Reference, m.OrderRef, m.Read, m.CreatedAtUtc })
                .PageAsync(offset, limit, ct);

            var items = new List<object>(rows.Count);
            foreach (var m in rows)
            {
                // El comprador escribe el número de pedido ("#1042"); los pedidos
                // de antes de la numeración llegaban con el id.
                Guid? orderId = null;
                if (m.Kind == ContactMessage.KindRepentance)
                {
                    var found = Guid.TryParse(m.OrderRef, out var candidate)
                        ? await orders.GetByIdAsync(tenant.TenantId, candidate, ct)
                        : global::Orders.Core.Domain.OrderLabel.ParseNumber(m.OrderRef) is { } number
                            ? await orders.GetByNumberAsync(tenant.TenantId, number, ct)
                            : null;
                    orderId = found?.Id;
                }
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

        // Lo que ya se le contestó (desde la bandeja). El formulario no tiene
        // historia propia: sin esto, dos personas del equipo contestaban lo
        // mismo y nadie sabía qué se le había dicho.
        contact.MapGet("/messages/{id:guid}/replies", async (
            Guid id, ITenantContext tenant, Support.Infrastructure.SupportDbContext support, CancellationToken ct) =>
        {
            var key = id.ToString();
            var replies = await support.InboxReplies.AsNoTracking()
                .Where(r => r.TenantId == tenant.TenantId.Value
                    && r.Channel == Support.Infrastructure.InboxChannel.Contact && r.ExternalId == key)
                .OrderBy(r => r.CreatedAtUtc)
                .Select(r => new { r.Id, r.AuthorName, r.Body, r.CreatedAtUtc })
                .ToListAsync(ct);
            return Results.Ok(new { items = replies });
        }).RequirePermission(Permission.MessagesRead);

        // Contestar por email, sin salir del panel. Las respuestas del cliente
        // le llegan a quien contestó (reply-to), no al no-reply de la tienda.
        contact.MapPost("/messages/{id:guid}/reply", async (
            Guid id, ContactReplyRequest req, HttpContext http, ITenantContext tenant, CustomersDbContext db,
            Support.Infrastructure.SupportDbContext support, BrandedEmailSender emails, CancellationToken ct) =>
        {
            var body = req.Body?.Trim() ?? string.Empty;
            if (body.Length is < 1 or > 4000) return Problem("Contact.InvalidReply", "Escribí la respuesta (hasta 4000 caracteres).");

            var tid = tenant.TenantId.Value;
            var msg = await db.ContactMessages.FirstOrDefaultAsync(m => m.Id == id && m.TenantId == tid, ct);
            if (msg is null) return Results.NotFound();

            var author = http.User.Identity?.Name ?? "staff";
            await emails.SendAsync(tid, msg.Email, "Respuesta a tu consulta",
                ContactReplyHtml(msg.Name, body, msg.Body), ct, template: "respuesta-contacto",
                replyTo: author.Contains('@') ? author : null);

            var reply = Support.Infrastructure.InboxReply.Create(
                tid, Support.Infrastructure.InboxChannel.Contact, id.ToString(), http.User.GetUserId(), author, body);
            support.InboxReplies.Add(reply);
            await support.SaveChangesAsync(ct);

            msg.MarkRead();
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { reply.Id, reply.AuthorName, reply.Body, reply.CreatedAtUtc });
        }).RequirePermission(Permission.MessagesRead);

        // Suscripción a novedades desde la tienda (anónima). El formulario estaba
        // en el storefront desde el principio pero no guardaba nada: quien lo
        // usaba creía estar armando una lista y no tenía ninguna.
        //
        // Con doble confirmación: el alta queda pendiente y sale un mail con el
        // link; recién al tocarlo (POST /newsletter/confirm) le llegan las
        // campañas. Sin eso cualquiera anotaba el email de otro. La respuesta
        // es la misma en todos los casos (nueva, pendiente, ya confirmada) y el
        // mail sale después de contestar: no dice quién está suscripto.
        var news = group.MapGroup("/newsletter").RequireTenant();

        news.MapPost("/", async (
            NewsletterRequest req, ITenantContext tenant, ICaptchaVerifier captcha, CustomersDbContext db,
            ShopperMailThrottle throttle, ShopperMailDispatch dispatch, CancellationToken ct) =>
        {
            // Trampa para bots: el campo va oculto por CSS, una persona no lo completa.
            // Se responde OK igual para no enseñarle al bot cuál era el problema.
            if (!string.IsNullOrWhiteSpace(req.Website)) return Results.Ok(new { ok = true });
            // Y el captcha, como contacto: el honeypot solo frena a los bots tontos.
            if (!await captcha.VerifyAsync(req.Captcha, ct)) return CaptchaProblem.Failed();

            var email = (req.Email ?? string.Empty).Trim().ToLowerInvariant();
            if (email.Length is < 3 or > 200 || !email.Contains('@'))
                return Problem("Newsletter.InvalidEmail", "Revisá el email.");

            var tid = tenant.TenantId.Value;
            var existing = await db.NewsletterSubscribers.FirstOrDefaultAsync(x => x.TenantId == tid && x.Email == email, ct);
            // Ya confirmada: nada que hacer. Con el tope de mails por dirección
            // (ShopperMailThrottle) alcanzado, tampoco: no se le llena la casilla.
            if (existing is { IsConfirmed: true } || !throttle.TryAcquire(tid, email))
                return Results.Ok(new { ok = true });

            var token = ShopAuth.NewToken();
            if (existing is null) db.NewsletterSubscribers.Add(NewsletterSubscriber.CreatePending(tid, email, req.Source, token));
            else existing.IssueConfirmToken(token);
            try
            {
                await db.SaveChangesAsync(ct);
            }
            catch (DbUpdateException)
            {
                // Dos envíos a la vez chocan contra el índice único: el otro ya
                // dejó la suscripción pendiente y mandó su mail.
                return Results.Ok(new { ok = true });
            }

            dispatch.Run(tid, async (sp, stop) =>
            {
                var link = await ShopAuthEndpoints.AccountLinkAsync(sp, tid, "/suscripcion/confirmar", token, stop);
                await sp.GetRequiredService<ShopperAccountEmails>().SendNewsletterConfirmAsync(tid, email, link, stop);
            });
            return Results.Ok(new { ok = true });
        }).RequireRateLimiting("auth");

        // El link del mail: confirma la suscripción. El token es de un solo uso
        // y de esta tienda; vence a los 7 días (suscribirse de nuevo manda otro).
        news.MapPost("/confirm", async (NewsletterConfirmRequest req, ITenantContext tenant, CustomersDbContext db, CancellationToken ct) =>
        {
            var tid = tenant.TenantId.Value;
            if (string.IsNullOrEmpty(req.Token))
                return Problem("Newsletter.InvalidToken", "El link no es válido o ya se usó. Si ya confirmaste, ya estás suscripto.");
            var hash = ShopperTokenHash.Of(req.Token);
            var subscriber = await db.NewsletterSubscribers.FirstOrDefaultAsync(x => x.TenantId == tid && x.ConfirmTokenHash == hash, ct);
            if (subscriber is null)
                return Problem("Newsletter.InvalidToken", "El link no es válido o ya se usó. Si ya confirmaste, ya estás suscripto.");
            if (subscriber.IsConfirmTokenExpired(DateTime.UtcNow))
                return Problem("Newsletter.TokenExpired", "El link venció. Volvé a suscribirte para recibir uno nuevo.");
            subscriber.Confirm();
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { ok = true });
        }).RequireRateLimiting("auth");

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

    private static string ContactReplyHtml(string name, string reply, string original) =>
        $@"<p style='margin:0 0 12px'>Hola {WebUtility.HtmlEncode(name)},</p>
<p style='margin:0 0 16px;white-space:pre-line'>{WebUtility.HtmlEncode(reply)}</p>
<p style='color:#8b8b8b;font-size:12px;margin:16px 0 4px'>Tu consulta:</p>
<blockquote style='margin:0;padding:8px 12px;border-left:3px solid #ddd;color:#555;white-space:pre-line'>{WebUtility.HtmlEncode(original)}</blockquote>";

    private static string RepentanceReceiptHtml(string name, string reference, string? orderRef)
    {
        var pedido = string.IsNullOrWhiteSpace(orderRef)
            ? string.Empty
            : $"<p style='margin:0 0 8px'>Pedido informado: <strong>{WebUtility.HtmlEncode(orderRef.Trim())}</strong></p>";
        return $@"<h2 style='margin:0 0 12px;font-size:20px'>Recibimos tu solicitud de arrepentimiento</h2>
<p style='margin:0 0 8px'>Hola {WebUtility.HtmlEncode(name)},</p>
<p style='margin:0 0 8px'>Registramos tu solicitud con el número de constancia <strong>{reference}</strong> el {ArgentinaTime.Now:dd/MM/yyyy}.</p>
{pedido}<p style='margin:0 0 8px'>La tienda se va a contactar con vos para coordinar la devolución y el reintegro del pago, sin costo adicional, según el art. 34 de la Ley 24.240 y la Resolución 424/2020.</p>
<p style='color:#8b8b8b;font-size:12px;margin-top:16px'>Guardá este email como constancia.</p>";
    }
}

/// <summary>Suscripción a novedades. `Website` es el honeypot (siempre vacío); `Captcha`, el token de Turnstile.</summary>
public sealed record NewsletterRequest(string? Email, string? Source = null, string? Website = null, string? Captcha = null);

/// <summary>El token del link del mail de "Confirmá tu suscripción".</summary>
public sealed record NewsletterConfirmRequest(string? Token);

/// <summary>Respuesta por email a un mensaje del formulario de contacto.</summary>
public sealed record ContactReplyRequest(string? Body);

public sealed record ContactSubmitRequest(
    string Name, string Email, string Body, string? Captcha, string? Kind = null, string? OrderRef = null);
