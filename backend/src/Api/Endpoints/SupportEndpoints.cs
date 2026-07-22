using Api.Auth;
using Api.Shop;
using Customers.Infrastructure;
using Media.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;
using SharedKernel.Abstractions;
using SharedKernel.Common;
using Support.Infrastructure;

namespace Api.Endpoints;

/// <summary>
/// Chat posventa: conversación por orden entre el comprador logueado y el staff.
/// Adjuntos PDF/JPG/PNG en bucket privado; acceso solo por URL firmada de vida
/// corta generada al listar. Tiempo real por polling corto (ver docs/support-chat.md).
/// </summary>
public static class SupportEndpoints
{
    private static readonly TimeSpan SignedUrlLifetime = TimeSpan.FromMinutes(15);

    public static RouteGroupBuilder MapSupportEndpoints(this RouteGroupBuilder group)
    {
        MapShopSide(group);
        MapAdminSide(group);
        return group;
    }

    // ---- Lado comprador (storefront, sesión de shopper) ----------------------

    private static void MapShopSide(RouteGroupBuilder group)
    {
        var shop = group.MapGroup("/shop/support").RequireTenant();

        // Abre (o devuelve) la conversación de una orden comprada por el cliente.
        shop.MapPost("/conversations", async (
            OpenConversationRequest req, HttpContext http, ITenantContext tenant,
            CustomersDbContext customersDb, IOrderRepository orders, SupportDbContext db, CancellationToken ct) =>
        {
            var customer = await ShopAuth.ResolveAsync(http, customersDb, ct);
            if (customer is null || string.IsNullOrEmpty(customer.Email)) return Results.Unauthorized();

            var existing = await db.Conversations.FirstOrDefaultAsync(
                c => c.TenantId == tenant.TenantId.Value && c.OrderId == req.OrderId, ct);
            if (existing is not null)
            {
                if (existing.CustomerId != customer.Id) return Results.Forbid();
                return Results.Ok(ToDto(existing));
            }

            // Solo órdenes del propio cliente y efectivamente compradas.
            var order = await orders.GetByIdAsync(tenant.TenantId, req.OrderId, ct);
            if (order is null || !string.Equals(order.BuyerEmail, customer.Email, StringComparison.OrdinalIgnoreCase))
                return Results.NotFound();
            if (order.PaidAtUtc is null)
                return Error.Conflict("Support.OrderNotPaid",
                    "El chat de posventa está disponible para compras pagadas.").ToProblem();

            var conv = Conversation.Open(tenant.TenantId.Value, order.Id, customer.Id, customer.Email);
            db.Conversations.Add(conv);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/shop/support/conversations/{conv.Id}", ToDto(conv));
        });

        // Mis conversaciones.
        shop.MapGet("/conversations", async (
            HttpContext http, ITenantContext tenant, CustomersDbContext customersDb, SupportDbContext db, CancellationToken ct) =>
        {
            var customer = await ShopAuth.ResolveAsync(http, customersDb, ct);
            if (customer is null) return Results.Unauthorized();

            var items = await db.Conversations.AsNoTracking()
                .Where(c => c.TenantId == tenant.TenantId.Value && c.CustomerId == customer.Id)
                .OrderByDescending(c => c.LastMessageAtUtc)
                .ToListAsync(ct);
            return Results.Ok(new { items = items.Select(ToDto) });
        });

        // Mensajes del hilo (y marca leído para el cliente).
        shop.MapGet("/conversations/{id:guid}/messages", async (
            Guid id, HttpContext http, ITenantContext tenant,
            CustomersDbContext customersDb, SupportDbContext db, IMediaStorage storage, CancellationToken ct) =>
        {
            var customer = await ShopAuth.ResolveAsync(http, customersDb, ct);
            if (customer is null) return Results.Unauthorized();

            var conv = await db.Conversations.FirstOrDefaultAsync(
                c => c.Id == id && c.TenantId == tenant.TenantId.Value && c.CustomerId == customer.Id, ct);
            if (conv is null) return Results.NotFound();

            var messages = await LoadMessagesAsync(db, storage, conv, ct);
            conv.MarkReadByCustomer();
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { conversation = ToDto(conv), items = messages });
        });

        // Enviar texto.
        shop.MapPost("/conversations/{id:guid}/messages", async (
            Guid id, SendMessageRequest req, HttpContext http, ITenantContext tenant,
            CustomersDbContext customersDb, SupportDbContext db, CancellationToken ct) =>
        {
            var customer = await ShopAuth.ResolveAsync(http, customersDb, ct);
            if (customer is null) return Results.Unauthorized();
            if (string.IsNullOrWhiteSpace(req.Body))
                return Error.Validation("Support.EmptyMessage", "El mensaje no puede estar vacío.").ToProblem();

            var conv = await db.Conversations.FirstOrDefaultAsync(
                c => c.Id == id && c.TenantId == tenant.TenantId.Value && c.CustomerId == customer.Id, ct);
            if (conv is null) return Results.NotFound();

            var msg = SupportMessage.Create(conv.Id, conv.TenantId, isFromStaff: false, customer.Email ?? "cliente", req.Body);
            conv.RegisterMessage(fromStaff: false);
            db.Messages.Add(msg);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { id = msg.Id, msg.CreatedAtUtc });
        });

        // Enviar adjunto (multipart "file" + texto opcional "body").
        shop.MapPost("/conversations/{id:guid}/attachments", async (
            Guid id, IFormFile file, HttpContext http, ITenantContext tenant,
            CustomersDbContext customersDb, SupportDbContext db, IMediaStorage storage, CancellationToken ct) =>
        {
            var customer = await ShopAuth.ResolveAsync(http, customersDb, ct);
            if (customer is null) return Results.Unauthorized();

            var conv = await db.Conversations.FirstOrDefaultAsync(
                c => c.Id == id && c.TenantId == tenant.TenantId.Value && c.CustomerId == customer.Id, ct);
            if (conv is null) return Results.NotFound();

            return await SendAttachmentAsync(
                db, storage, conv, file, http.Request.Form["body"].ToString(),
                isFromStaff: false, authorName: customer.Email ?? "cliente", ct);
        }).DisableAntiforgery();
    }

    // ---- Lado admin (staff de la tienda) ------------------------------------

    private static void MapAdminSide(RouteGroupBuilder group)
    {
        var admin = group.MapGroup("/support").RequireTenantMembership();

        // Bandeja: todas las conversaciones del tenant, no leídas primero.
        admin.MapGet("/conversations", async (ITenantContext tenant, SupportDbContext db, CancellationToken ct) =>
        {
            var items = await db.Conversations.AsNoTracking()
                .Where(c => c.TenantId == tenant.TenantId.Value)
                .OrderByDescending(c => c.UnreadForStaff > 0)
                .ThenByDescending(c => c.LastMessageAtUtc)
                .Take(200)
                .ToListAsync(ct);
            var unreadTotal = await db.Conversations.AsNoTracking()
                .Where(c => c.TenantId == tenant.TenantId.Value)
                .SumAsync(c => c.UnreadForStaff, ct);
            return Results.Ok(new { items = items.Select(ToDto), unreadTotal });
        });

        admin.MapGet("/conversations/{id:guid}/messages", async (
            Guid id, ITenantContext tenant, SupportDbContext db, IMediaStorage storage, CancellationToken ct) =>
        {
            var conv = await db.Conversations.FirstOrDefaultAsync(
                c => c.Id == id && c.TenantId == tenant.TenantId.Value, ct);
            if (conv is null) return Results.NotFound();

            var messages = await LoadMessagesAsync(db, storage, conv, ct);
            conv.MarkReadByStaff();
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { conversation = ToDto(conv), items = messages });
        });

        admin.MapPost("/conversations/{id:guid}/messages", async (
            Guid id, SendMessageRequest req, HttpContext http, ITenantContext tenant, SupportDbContext db, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(req.Body))
                return Error.Validation("Support.EmptyMessage", "El mensaje no puede estar vacío.").ToProblem();

            var conv = await db.Conversations.FirstOrDefaultAsync(
                c => c.Id == id && c.TenantId == tenant.TenantId.Value, ct);
            if (conv is null) return Results.NotFound();

            var author = http.User.Identity?.Name ?? "staff";
            var msg = SupportMessage.Create(conv.Id, conv.TenantId, isFromStaff: true, author, req.Body);
            conv.RegisterMessage(fromStaff: true);
            db.Messages.Add(msg);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { id = msg.Id, msg.CreatedAtUtc });
        });

        admin.MapPost("/conversations/{id:guid}/attachments", async (
            Guid id, IFormFile file, HttpContext http, ITenantContext tenant,
            SupportDbContext db, IMediaStorage storage, CancellationToken ct) =>
        {
            var conv = await db.Conversations.FirstOrDefaultAsync(
                c => c.Id == id && c.TenantId == tenant.TenantId.Value, ct);
            if (conv is null) return Results.NotFound();

            return await SendAttachmentAsync(
                db, storage, conv, file, http.Request.Form["body"].ToString(),
                isFromStaff: true, authorName: http.User.Identity?.Name ?? "staff", ct);
        }).DisableAntiforgery();

        admin.MapPost("/conversations/{id:guid}/close", async (
            Guid id, ITenantContext tenant, SupportDbContext db, CancellationToken ct) =>
        {
            var conv = await db.Conversations.FirstOrDefaultAsync(
                c => c.Id == id && c.TenantId == tenant.TenantId.Value, ct);
            if (conv is null) return Results.NotFound();
            conv.Close();
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToDto(conv));
        });
    }

    // ---- Helpers -------------------------------------------------------------

    private static async Task<IResult> SendAttachmentAsync(
        SupportDbContext db, IMediaStorage storage, Conversation conv, IFormFile file,
        string? body, bool isFromStaff, string authorName, CancellationToken ct)
    {
        if (file.Length is <= 0 or > S3MediaStorage.MaxAttachmentBytes)
            return Error.Validation("Support.AttachmentTooLarge",
                $"El archivo debe pesar hasta {S3MediaStorage.MaxAttachmentBytes / 1024 / 1024} MB.").ToProblem();

        // Buffer en memoria: el form stream no siempre es seekable y la validación
        // de magic bytes necesita releer el inicio. Cap de 10 MB ya validado.
        using var buffer = new MemoryStream();
        await using (var s = file.OpenReadStream())
            await s.CopyToAsync(buffer, ct);
        buffer.Seek(0, SeekOrigin.Begin);

        var upload = await storage.UploadPrivateAsync(
            conv.TenantId, $"support/{conv.Id:N}", buffer, file.ContentType, buffer.Length, ct);
        if (upload.IsFailure) return upload.Error.ToProblem();

        var msg = SupportMessage.Create(
            conv.Id, conv.TenantId, isFromStaff, authorName,
            string.IsNullOrWhiteSpace(body) ? string.Empty : body,
            upload.Value, Path.GetFileName(file.FileName), file.ContentType.ToLowerInvariant());
        conv.RegisterMessage(isFromStaff);
        db.Messages.Add(msg);
        await db.SaveChangesAsync(ct);
        return Results.Ok(new { id = msg.Id, msg.CreatedAtUtc });
    }

    private static async Task<List<object>> LoadMessagesAsync(
        SupportDbContext db, IMediaStorage storage, Conversation conv, CancellationToken ct)
    {
        var messages = await db.Messages.AsNoTracking()
            .Where(m => m.ConversationId == conv.Id)
            .OrderBy(m => m.CreatedAtUtc)
            .Take(500)
            .ToListAsync(ct);

        return [.. messages.Select(m => (object)new
        {
            m.Id,
            m.IsFromStaff,
            m.AuthorName,
            m.Body,
            attachment = m.AttachmentKey is null ? null : new
            {
                name = m.AttachmentName,
                contentType = m.AttachmentContentType,
                url = storage.GetSignedUrl(m.AttachmentKey, SignedUrlLifetime),
            },
            m.CreatedAtUtc,
        })];
    }

    private static object ToDto(Conversation c) => new
    {
        c.Id,
        c.OrderId,
        c.CustomerEmail,
        status = c.Status.ToString().ToUpperInvariant(),
        c.UnreadForCustomer,
        c.UnreadForStaff,
        c.CreatedAtUtc,
        c.LastMessageAtUtc,
    };
}

public sealed record OpenConversationRequest(Guid OrderId);

public sealed record SendMessageRequest(string? Body);
