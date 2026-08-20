using System.Text.Json;
using Api.Auth;
using Api.Meli;
using Catalog.Core.Domain;
using Identity.Infrastructure;
using Inventory.Core.Domain;
using MercadoLibre.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace Api.Endpoints;

/// <summary>
/// Integración con Mercado Libre: la tienda conecta su cuenta por OAuth y el
/// panel muestra sus ventas, preguntas, mensajes y reclamos de ML, sincroniza
/// stock con las publicaciones vinculadas y publica productos.
/// Tokens SIEMPRE cifrados; el webhook público solo persiste (inbox durable).
/// </summary>
public static class MeliEndpoints
{
    public static RouteGroupBuilder MapMeliEndpoints(this RouteGroupBuilder group)
    {
        MapConnection(group);
        MapSales(group);
        MapPublications(group);
        MapWebhook(group);
        return group;
    }

    // ------------------------------------------------ Conexión y configuración

    private static void MapConnection(RouteGroupBuilder group)
    {
        var config = group.MapGroup("/admin/meli").RequirePermission(Permission.SettingsWrite);

        config.MapGet("/connection", async (
            ITenantContext tenant, MeliDbContext db, IOptions<MeliOptions> options, CancellationToken ct) =>
        {
            var c = await db.Connections.AsNoTracking().FirstOrDefaultAsync(ct);
            return Results.Ok(new
            {
                available = options.Value.Configured,
                connected = c is not null,
                nickname = c?.Nickname,
                meliUserId = c?.MeliUserId,
                siteId = c?.SiteId,
                stockSyncEnabled = c?.StockSyncEnabled ?? false,
                stockBufferUnits = c?.StockBufferUnits ?? 0,
                priceSyncEnabled = c?.PriceSyncEnabled ?? false,
                priceMarkupPct = c?.PriceMarkupPct ?? 0m,
                autoInvoiceEnabled = c?.AutoInvoiceEnabled ?? false,
                connectedAtUtc = c?.ConnectedAtUtc,
            });
        });

        config.MapPost("/connect", (
            ITenantContext tenant, MeliClient client, MeliTokenService tokens, IOptions<MeliOptions> options) =>
        {
            if (!options.Value.Configured)
                return Error.Validation("Meli.NotConfigured",
                    "La integración con Mercado Libre no está configurada en esta plataforma.").ToProblem();
            return Results.Ok(new { authUrl = client.BuildAuthorizationUrl(tokens.ProtectState(tenant.TenantId.Value)) });
        });

        config.MapDelete("/connection", async (ITenantContext tenant, MeliDbContext db, CancellationToken ct) =>
        {
            var c = await db.Connections.FirstOrDefaultAsync(ct);
            if (c is null) return Results.NoContent();
            db.Connections.Remove(c);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        config.MapPut("/settings", async (
            MeliSettingsRequest request, ITenantContext tenant, MeliDbContext db, CancellationToken ct) =>
        {
            var c = await db.Connections.FirstOrDefaultAsync(ct);
            if (c is null)
                return Error.Conflict("Meli.NotConnected", "Conectá tu cuenta de Mercado Libre primero.").ToProblem();
            c.SetStockSync(request.StockSyncEnabled, request.StockBufferUnits, request.AutoInvoiceEnabled);
            c.SetPriceSync(request.PriceSyncEnabled ?? c.PriceSyncEnabled, request.PriceMarkupPct);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new
            {
                stockSyncEnabled = c.StockSyncEnabled,
                stockBufferUnits = c.StockBufferUnits,
                priceSyncEnabled = c.PriceSyncEnabled,
                priceMarkupPct = c.PriceMarkupPct,
                autoInvoiceEnabled = c.AutoInvoiceEnabled,
            });
        });

        // Backfill manual: trae las últimas ventas (se usa al conectar).
        config.MapPost("/orders/refresh", async (
            ITenantContext tenant, MeliDbContext db, MeliSyncService sync, CancellationToken ct) =>
        {
            var c = await db.Connections.AsNoTracking().FirstOrDefaultAsync(ct);
            if (c is null)
                return Error.Conflict("Meli.NotConnected", "Conectá tu cuenta de Mercado Libre primero.").ToProblem();
            try
            {
                var count = await sync.BackfillOrdersAsync(c.TenantId, c.MeliUserId, ct);
                return Results.Ok(new { imported = count });
            }
            catch (MeliException ex)
            {
                return Error.Validation("Meli.RefreshFailed", ex.Message).ToProblem();
            }
        });

        // Callback OAuth público: el tenant viaja firmado en el state.
        group.MapGet("/meli/oauth/callback", async (
            string? code, string? state,
            MeliClient client, MeliTokenService tokens, MeliDbContext db, MeliSyncService sync,
            IOptions<MeliOptions> options, ILoggerFactory loggerFactory, CancellationToken ct) =>
        {
            var logger = loggerFactory.CreateLogger("MeliOAuth");
            var returnUrl = options.Value.AdminReturnUrl;
            if (string.IsNullOrEmpty(code) || string.IsNullOrEmpty(state))
                return Results.Redirect($"{returnUrl}?meli=error");

            var tenantId = tokens.TryUnprotectState(state);
            if (tenantId is null) return Results.Redirect($"{returnUrl}?meli=error");

            try
            {
                var pair = await client.ExchangeCodeAsync(code, ct);

                // Nickname y site del vendedor para mostrar en el panel.
                using var me = await client.GetAsync(pair.AccessToken, "/users/me", ct);
                var nickname = me.RootElement.TryGetProperty("nickname", out var n) ? n.GetString() ?? "" : "";
                var siteId = me.RootElement.TryGetProperty("site_id", out var s) ? s.GetString() ?? "MLA" : "MLA";

                var accessEnc = tokens.Protect(pair.AccessToken);
                var refreshEnc = string.IsNullOrEmpty(pair.RefreshToken) ? string.Empty : tokens.Protect(pair.RefreshToken);
                var expiresAt = DateTime.UtcNow.AddSeconds(pair.ExpiresInSeconds);

                var existing = await db.Connections.IgnoreQueryFilters()
                    .FirstOrDefaultAsync(c => c.TenantId == tenantId.Value, ct);
                if (existing is null)
                {
                    var created = MeliConnection.Create(
                        tenantId.Value, pair.UserId, nickname, siteId, accessEnc, refreshEnc, expiresAt);
                    if (created.IsFailure) return Results.Redirect($"{returnUrl}?meli=error");
                    db.Connections.Add(created.Value);
                }
                else
                {
                    existing.UpdateTokens(pair.UserId, nickname, siteId, accessEnc, refreshEnc, expiresAt);
                }
                await db.SaveChangesAsync(ct);

                // Primer backfill best-effort: si falla, el panel tiene "Actualizar".
                try { await sync.BackfillOrdersAsync(tenantId.Value, pair.UserId, ct); }
                catch (MeliException ex) { logger.LogWarning("Backfill inicial ML falló: {Message}", ex.Message); }

                logger.LogInformation("Mercado Libre conectado para tenant {TenantId} (ml_user {UserId}).",
                    tenantId, pair.UserId);
                return Results.Redirect($"{returnUrl}?meli=connected");
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "OAuth de Mercado Libre falló para tenant {TenantId}.", tenantId);
                return Results.Redirect($"{returnUrl}?meli=error");
            }
        });
    }

    // ------------------------------------------- Ventas, preguntas y mensajes

    private static void MapSales(RouteGroupBuilder group)
    {
        var sales = group.MapGroup("/admin/meli").RequirePermission(Permission.OrdersRead);

        // Estado liviano para la página del canal (sin exponer configuración).
        sales.MapGet("/status", async (ITenantContext tenant, MeliDbContext db, CancellationToken ct) =>
        {
            var c = await db.Connections.AsNoTracking().FirstOrDefaultAsync(ct);
            return Results.Ok(new { connected = c is not null, nickname = c?.Nickname });
        });

        // Ventas del cache local (rápido; el webhook + refresh lo mantienen al día).
        sales.MapGet("/orders", async (
            ITenantContext tenant, MeliDbContext db, int? offset, int? limit, CancellationToken ct) =>
        {
            var take = Math.Clamp(limit ?? 25, 1, 100);
            var skip = Math.Max(0, offset ?? 0);

            var query = db.Orders.AsNoTracking().OrderByDescending(o => o.DateCreatedUtc);
            var total = await query.CountAsync(ct);
            var rows = await query.Skip(skip).Take(take).ToListAsync(ct);

            return Results.Ok(new
            {
                total,
                items = rows.Select(o => new
                {
                    o.MeliOrderId,
                    o.PackId,
                    o.Status,
                    o.DateCreatedUtc,
                    o.TotalAmount,
                    o.PaidAmount,
                    o.CurrencyId,
                    o.BuyerNickname,
                    o.BuyerId,
                    items = MeliSyncService.ParseSnapshot(o.ItemsJson),
                    o.ShipmentId,
                    o.StockApplied,
                    o.FiscalDocumentId,
                }),
            });
        });

        // Métricas para Estadísticas (multicanal): ventas ML del período.
        sales.MapGet("/stats", async (
            ITenantContext tenant, MeliDbContext db, int? days, CancellationToken ct) =>
        {
            var since = DateTime.UtcNow.AddDays(-Math.Clamp(days ?? 30, 1, 365));

            var paid = await db.Orders.AsNoTracking()
                .Where(o => o.DateCreatedUtc >= since && (o.Status == "paid" || o.Status == "partially_refunded"))
                .ToListAsync(ct);

            return Results.Ok(new
            {
                connected = await db.Connections.AsNoTracking().AnyAsync(ct),
                orders = paid.Count,
                revenue = paid.Sum(o => o.PaidAmount > 0 ? o.PaidAmount : o.TotalAmount),
                currency = paid.Select(o => o.CurrencyId).FirstOrDefault() ?? "ARS",
                unitsSold = paid.Sum(o =>
                    MeliSyncService.ParseSnapshot(o.ItemsJson).Sum(i => i.Quantity)),
            });
        });

        // Preguntas prevente (proxy en vivo — sin cache, siempre frescas).
        sales.MapGet("/questions", async (
            ITenantContext tenant, MeliDbContext db, MeliTokenService tokens, MeliClient client,
            string? status, CancellationToken ct) =>
        {
            var c = await db.Connections.AsNoTracking().FirstOrDefaultAsync(ct);
            if (c is null) return Results.Ok(new { total = 0, questions = Array.Empty<object>() });
            if (c.IsDemo) return Results.Ok(MeliDemoFeed.Questions(status));

            var token = await tokens.GetValidTokenAsync(c.TenantId, ct);
            if (token is null) return Results.Ok(new { total = 0, questions = Array.Empty<object>() });

            var filter = string.IsNullOrWhiteSpace(status) ? "" : $"&status={Uri.EscapeDataString(status)}";
            try
            {
                using var doc = await client.GetAsync(token,
                    $"/questions/search?seller_id={c.MeliUserId}&api_version=4&sort_fields=date_created&sort_types=DESC&limit=50{filter}", ct);
                var root = doc.RootElement;
                var questions = root.TryGetProperty("questions", out var qs) && qs.ValueKind == JsonValueKind.Array
                    ? qs.EnumerateArray().Select(q => (object)new
                    {
                        id = q.TryGetProperty("id", out var id) ? id.GetInt64() : 0,
                        text = JsonRead.GetString(q, "text"),
                        status = JsonRead.GetString(q, "status"),
                        itemId = JsonRead.GetString(q, "item_id"),
                        dateCreated = JsonRead.GetString(q, "date_created"),
                        answer = q.TryGetProperty("answer", out var a) && a.ValueKind == JsonValueKind.Object
                            ? new { text = JsonRead.GetString(a, "text"), dateCreated = JsonRead.GetString(a, "date_created") }
                            : null,
                    }).ToArray()
                    : [];
                return Results.Ok(new
                {
                    total = root.TryGetProperty("total", out var t) && t.ValueKind == JsonValueKind.Number ? t.GetInt32() : questions.Length,
                    questions,
                });
            }
            catch (MeliException ex)
            {
                return Error.Validation("Meli.Questions", ex.Message).ToProblem();
            }
        });

        // Facturación ARCA de una venta ML: el cache de ML no crea una Order
        // local, así que se emite por el camino de emisión manual (OrderId null,
        // consumidor final) y el comprobante queda vinculado a la venta.
        var fiscal = group.MapGroup("/admin/meli").RequirePermission(Permission.FiscalEmit);
        fiscal.MapPost("/orders/{meliOrderId:long}/invoice", async (
            long meliOrderId, ITenantContext tenant, MeliDbContext db,
            global::Fiscal.Core.Abstractions.IInvoiceEmitter emitter, CancellationToken ct) =>
        {
            var order = await db.Orders.FirstOrDefaultAsync(o => o.MeliOrderId == meliOrderId, ct);
            if (order is null)
                return Error.NotFound("Meli.OrderNotFound", "Esa venta no existe.").ToProblem();
            if (!order.IsPaid)
                return Error.Validation("Meli.NotPaid", "Solo se facturan ventas pagadas.").ToProblem();
            if (order.FiscalDocumentId is not null)
                return Error.Conflict("Meli.AlreadyInvoiced", "Esta venta ya tiene comprobante emitido.").ToProblem();

            var minor = order.BillableMinorUnits;
            if (minor <= 0)
                return Error.Validation("Meli.BadAmount", "La venta no tiene importe.").ToProblem();

            // ML no expone el documento del comprador por esta vía: consumidor final.
            // El id de la venta ML va como OrderId: vincula el comprobante para que
            // la nota de crédito lo encuentre y evita doble facturación de la venta.
            var result = await emitter.EmitAsync(
                new global::Fiscal.Core.Abstractions.EmitInvoiceCommand(tenant.TenantId.Value, order.Id, minor), ct);
            if (result.IsFailure) return result.Error.ToProblem();
            var r = result.Value;
            if (!r.Authorized)
            {
                var detail = r.Errors.Count > 0
                    ? string.Join("; ", r.Errors.Select(e => $"{e.Code} {e.Message}"))
                    : "ARCA rechazó el comprobante.";
                return Error.Validation("Meli.InvoiceRejected", detail).ToProblem();
            }

            order.MarkInvoiced(r.DocumentId);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new
            {
                r.DocumentId,
                r.PtoVta,
                cbteTipo = r.CbteTipo,
                r.Number,
                r.Cae,
                caeVto = r.CaeVto?.ToString("yyyy-MM-dd"),
            });
        });

        var actions = group.MapGroup("/admin/meli").RequirePermission(Permission.OrdersFulfill);

        actions.MapPost("/questions/{questionId:long}/answer", async (
            long questionId, MeliAnswerRequest request,
            ITenantContext tenant, MeliDbContext db, MeliTokenService tokens, MeliClient client, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Text))
                return Error.Validation("Meli.EmptyAnswer", "Escribí una respuesta.").ToProblem();

            if (await IsDemoAsync(db, ct)) return DemoIsReadOnly();

            var resolved = await ResolveConnectionAsync(db, tokens, ct);
            if (resolved is null) return NotConnected();
            var (c, token) = resolved.Value;

            try
            {
                using var _ = await client.PostAsync(token, "/answers",
                    new { question_id = questionId, text = request.Text.Trim() }, ct);
                return Results.NoContent();
            }
            catch (MeliException ex)
            {
                return Error.Validation("Meli.AnswerFailed", ex.Message).ToProblem();
            }
        });

        // Mensajería posventa por pack. Solo lectura con OrdersRead…
        sales.MapGet("/packs/{packId:long}/messages", async (
            long packId, ITenantContext tenant, MeliDbContext db,
            MeliTokenService tokens, MeliClient client, CancellationToken ct) =>
        {
            if (await IsDemoAsync(db, ct)) return Results.Ok(MeliDemoFeed.Messages());

            var resolved = await ResolveConnectionAsync(db, tokens, ct);
            if (resolved is null) return NotConnected();
            var (c, token) = resolved.Value;

            try
            {
                using var doc = await client.GetAsync(token,
                    $"/messages/packs/{packId}/sellers/{c.MeliUserId}?tag=post_sale", ct);
                var root = doc.RootElement;
                var messages = root.TryGetProperty("messages", out var ms) && ms.ValueKind == JsonValueKind.Array
                    ? ms.EnumerateArray().Select(m => (object)new
                    {
                        text = m.TryGetProperty("text", out var txt) ? txt.GetString() : null,
                        dateCreated = JsonRead.GetString(m, "message_date")
                            ?? (m.TryGetProperty("message_date", out var md) && md.ValueKind == JsonValueKind.Object
                                ? JsonRead.GetString(md, "created") : null),
                        fromSeller = m.TryGetProperty("from", out var f) && f.ValueKind == JsonValueKind.Object
                            && f.TryGetProperty("user_id", out var fid)
                            && fid.ToString().Trim('"') == c.MeliUserId.ToString(),
                    }).ToArray()
                    : [];
                return Results.Ok(new { messages });
            }
            catch (MeliException ex)
            {
                return Error.Validation("Meli.Messages", ex.Message).ToProblem();
            }
        });

        // …y escritura con OrdersFulfill. El buyer se valida contra el cache
        // local (nunca se manda un mensaje a un user arbitrario del request).
        actions.MapPost("/packs/{packId:long}/messages", async (
            long packId, MeliSendMessageRequest request,
            ITenantContext tenant, MeliDbContext db, MeliTokenService tokens, MeliClient client, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Text))
                return Error.Validation("Meli.EmptyMessage", "Escribí un mensaje.").ToProblem();
            if (request.Text.Length > 350)
                return Error.Validation("Meli.MessageTooLong",
                    "Mercado Libre limita los mensajes a 350 caracteres.").ToProblem();
            if (await IsDemoAsync(db, ct)) return DemoIsReadOnly();

            var resolved = await ResolveConnectionAsync(db, tokens, ct);
            if (resolved is null) return NotConnected();
            var (c, token) = resolved.Value;

            var order = await db.Orders.AsNoTracking()
                .FirstOrDefaultAsync(o => o.PackId == packId || o.MeliOrderId == packId, ct);
            if (order is null || order.BuyerId == 0)
                return Error.Validation("Meli.PackNotFound", "No se encontró la venta de ese chat.").ToProblem();

            try
            {
                using var _ = await client.PostAsync(token,
                    $"/messages/packs/{packId}/sellers/{c.MeliUserId}?tag=post_sale",
                    new
                    {
                        from = new { user_id = c.MeliUserId.ToString() },
                        to = new { user_id = order.BuyerId.ToString() },
                        text = request.Text.Trim(),
                    }, ct);
                return Results.NoContent();
            }
            catch (MeliException ex)
            {
                return Error.Validation("Meli.SendFailed", ex.Message).ToProblem();
            }
        });

        // Reclamos post-venta (proxy en vivo).
        sales.MapGet("/claims", async (
            ITenantContext tenant, MeliDbContext db, MeliTokenService tokens, MeliClient client, CancellationToken ct) =>
        {
            if (await IsDemoAsync(db, ct)) return Results.Ok(MeliDemoFeed.Claims());

            var resolved = await ResolveConnectionAsync(db, tokens, ct);
            if (resolved is null) return Results.Ok(new { claims = Array.Empty<object>() });
            var (c, token) = resolved.Value;

            try
            {
                using var doc = await client.GetAsync(token, "/post-purchase/v1/claims/search?limit=30", ct);
                var root = doc.RootElement;
                var claims = root.TryGetProperty("data", out var data) && data.ValueKind == JsonValueKind.Array
                    ? data.EnumerateArray().Select(cl => (object)new
                    {
                        id = cl.TryGetProperty("id", out var id) ? id.ToString() : "",
                        status = JsonRead.GetString(cl, "status"),
                        stage = JsonRead.GetString(cl, "stage"),
                        reasonId = JsonRead.GetString(cl, "reason_id"),
                        resourceId = cl.TryGetProperty("resource_id", out var rid) ? rid.ToString() : "",
                        dateCreated = JsonRead.GetString(cl, "date_created"),
                    }).ToArray()
                    : [];
                return Results.Ok(new { claims });
            }
            catch (MeliException)
            {
                // El recurso de claims varía por site/cuenta: sin reclamos ≠ error del panel.
                return Results.Ok(new { claims = Array.Empty<object>() });
            }
        });
    }

    /// <summary>Conexión de la tienda + access token vigente, o null si no está conectada.</summary>
    private static async Task<(MeliConnection Conn, string Token)?> ResolveConnectionAsync(
        MeliDbContext db, MeliTokenService tokens, CancellationToken ct)
    {
        var c = await db.Connections.AsNoTracking().FirstOrDefaultAsync(ct);
        var token = c is null ? null : await tokens.GetValidTokenAsync(c.TenantId, ct);
        return token is null ? null : (c!, token);
    }

    /// <summary>
    /// Cuenta de demostración: se contesta con un ejemplo fijo en vez de salir
    /// a la API de Mercado Libre, que sin OAuth real devolvería un 401.
    /// </summary>
    private static async Task<bool> IsDemoAsync(MeliDbContext db, CancellationToken ct) =>
        await db.Connections.AsNoTracking().AnyAsync(c => c.IsDemo, ct);

    private static IResult DemoIsReadOnly() =>
        Error.Conflict("Meli.Demo",
            "Es una cuenta de demostración: no se puede escribir en Mercado Libre. Conectá una cuenta real.").ToProblem();

    private static IResult NotConnected() =>
        Error.Conflict("Meli.NotConnected", "Conectá tu cuenta de Mercado Libre primero.").ToProblem();

    // ------------------------------------------ Publicaciones, links y publicar

    private static void MapPublications(RouteGroupBuilder group)
    {
        var items = group.MapGroup("/admin/meli").RequirePermission(Permission.CatalogWrite);

        // Publicaciones del vendedor + estado de vínculo con el catálogo local.
        items.MapGet("/items", async (
            ITenantContext tenant, MeliDbContext db, MeliTokenService tokens, MeliClient client, CancellationToken ct) =>
        {
            if (await IsDemoAsync(db, ct))
                return Results.Ok(MeliDemoFeed.ItemsWithLinks(await db.ItemLinks.AsNoTracking().ToListAsync(ct)));

            var resolved = await ResolveConnectionAsync(db, tokens, ct);
            if (resolved is null) return Results.Ok(new { items = Array.Empty<object>() });
            var (c, token) = resolved.Value;

            try
            {
                using var search = await client.GetAsync(token,
                    $"/users/{c.MeliUserId}/items/search?limit=50", ct);
                var ids = search.RootElement.TryGetProperty("results", out var res) && res.ValueKind == JsonValueKind.Array
                    ? res.EnumerateArray().Select(e => e.GetString()).Where(s => !string.IsNullOrEmpty(s)).ToList()
                    : [];
                if (ids.Count == 0) return Results.Ok(new { items = Array.Empty<object>() });

                var links = await db.ItemLinks.AsNoTracking().ToListAsync(ct);
                var result = new List<object>();

                // Multiget de a 20 (límite del endpoint /items?ids=).
                foreach (var chunk in ids.Chunk(20))
                {
                    using var doc = await client.GetAsync(token, $"/items?ids={string.Join(',', chunk)}", ct);
                    if (doc.RootElement.ValueKind != JsonValueKind.Array) continue;
                    foreach (var wrapper in doc.RootElement.EnumerateArray())
                    {
                        if (!wrapper.TryGetProperty("body", out var item)) continue;
                        var itemId = JsonRead.GetString(item, "id") ?? "";
                        var link = links.FirstOrDefault(l => l.MeliItemId == itemId);
                        result.Add(new
                        {
                            id = itemId,
                            title = JsonRead.GetString(item, "title"),
                            status = JsonRead.GetString(item, "status"),
                            permalink = JsonRead.GetString(item, "permalink"),
                            thumbnail = JsonRead.GetString(item, "thumbnail"),
                            price = JsonRead.GetDecimal(item, "price"),
                            availableQuantity = JsonRead.GetInt32(item, "available_quantity"),
                            link = link is null ? null : new
                            {
                                link.ProductId,
                                link.VariantId,
                                link.MeliVariationId,
                                link.SyncStock,
                                link.LastPushedQty,
                                link.SyncPrice,
                                lastPushedPrice = link.LastPushedPriceMinor is { } m ? m / 100m : (decimal?)null,
                            },
                        });
                    }
                }
                return Results.Ok(new { items = result });
            }
            catch (MeliException ex)
            {
                return Error.Validation("Meli.Items", ex.Message).ToProblem();
            }
        });

        // Vincular publicación ↔ variante local (base del stock unificado).
        items.MapPost("/items/{itemId}/link", async (
            string itemId, MeliLinkRequest request,
            ITenantContext tenant, MeliDbContext db, IProductRepository products, CancellationToken ct) =>
        {

            var product = await products.GetByIdAsync(tenant.TenantId, request.ProductId, ct);
            var variant = product?.Variants.FirstOrDefault(v => v.Id == request.VariantId);
            if (product is null || variant is null)
                return Error.Validation("Meli.VariantNotFound", "Esa variante no existe en tu catálogo.").ToProblem();

            var normalized = itemId.Trim().ToUpperInvariant();
            var existing = await db.ItemLinks.FirstOrDefaultAsync(
                l => l.MeliItemId == normalized && l.MeliVariationId == request.MeliVariationId, ct);
            if (existing is not null) db.ItemLinks.Remove(existing);

            var link = MeliItemLink.Create(
                tenant.TenantId.Value, normalized, request.MeliVariationId,
                product.Id, variant.Id, request.Title ?? product.Name);
            if (link.IsFailure) return link.Error.ToProblem();

            db.ItemLinks.Add(link.Value);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { link.Value.Id, link.Value.MeliItemId, link.Value.VariantId });
        });

        items.MapDelete("/items/{itemId}/link", async (
            string itemId, long? variationId, ITenantContext tenant, MeliDbContext db, CancellationToken ct) =>
        {
            var normalized = itemId.Trim().ToUpperInvariant();
            var link = await db.ItemLinks.FirstOrDefaultAsync(
                l => l.MeliItemId == normalized && l.MeliVariationId == variationId, ct);
            if (link is null) return Results.NoContent();
            db.ItemLinks.Remove(link);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        // Predicción de categoría para el flujo de publicar.
        items.MapGet("/categories/predict", async (
            string title, ITenantContext tenant, MeliDbContext db,
            MeliTokenService tokens, MeliClient client, CancellationToken ct) =>
        {
            var resolved = await ResolveConnectionAsync(db, tokens, ct);
            if (resolved is null) return NotConnected();
            var (c, token) = resolved.Value;

            try
            {
                using var doc = await client.GetAsync(token,
                    $"/sites/{c.SiteId}/domain_discovery/search?q={Uri.EscapeDataString(title)}&limit=3", ct);
                var suggestions = doc.RootElement.ValueKind == JsonValueKind.Array
                    ? doc.RootElement.EnumerateArray().Select(s => (object)new
                    {
                        categoryId = JsonRead.GetString(s, "category_id"),
                        categoryName = JsonRead.GetString(s, "category_name"),
                        domainName = JsonRead.GetString(s, "domain_name"),
                    }).ToArray()
                    : [];
                return Results.Ok(new { suggestions });
            }
            catch (MeliException ex)
            {
                return Error.Validation("Meli.Predict", ex.Message).ToProblem();
            }
        });

        // Publicar un producto del catálogo en Mercado Libre (v1: sin variaciones
        // ML; el stock publicado es el disponible local de la variante elegida).
        items.MapPost("/products/{productId:guid}/publish", async (
            Guid productId, MeliPublishRequest request,
            ITenantContext tenant, MeliDbContext db, MeliTokenService tokens, MeliClient client,
            IProductRepository products, IStockRepository stock, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.CategoryId))
                return Error.Validation("Meli.NoCategory",
                    "Elegí una categoría de Mercado Libre (usá la sugerencia automática).").ToProblem();

            if (await IsDemoAsync(db, ct)) return DemoIsReadOnly();

            var resolved = await ResolveConnectionAsync(db, tokens, ct);
            if (resolved is null) return NotConnected();
            var (c, token) = resolved.Value;

            var product = await products.GetByIdAsync(tenant.TenantId, productId, ct);
            if (product is null)
                return Error.Validation("Meli.ProductNotFound", "Ese producto no existe.").ToProblem();

            var variant = request.VariantId is { } vid
                ? product.Variants.FirstOrDefault(v => v.Id == vid)
                : product.Variants.Count > 0 ? product.Variants[0] : null;
            if (variant is null)
                return Error.Validation("Meli.NoVariant", "El producto no tiene variantes.").ToProblem();

            var stockRows = await stock.GetByVariantsAsync(tenant.TenantId, [variant.Id], ct);
            var available = stockRows.Count > 0 ? stockRows[0].Available : 0;
            if (available <= 0)
                return Error.Validation("Meli.NoStock",
                    "La variante no tiene stock disponible: Mercado Libre exige publicar con stock.").ToProblem();

            // Precio local en centavos → ML espera decimal en la moneda del site.
            var payload = new Dictionary<string, object?>
            {
                ["title"] = product.Name.Length > 60 ? product.Name[..60] : product.Name,
                ["category_id"] = request.CategoryId,
                ["price"] = variant.Price.AmountInMinorUnits / 100m,
                ["currency_id"] = variant.Price.Currency,
                ["available_quantity"] = Math.Max(1, available - c.StockBufferUnits),
                ["condition"] = "new",
                ["listing_type_id"] = string.IsNullOrWhiteSpace(request.ListingTypeId) ? "gold_special" : request.ListingTypeId,
                ["pictures"] = product.Images.OrderBy(i => i.Position).Take(6)
                    .Select(i => new { source = i.Url }).ToArray(),
            };
            var attributes = new List<object>();
            if (!string.IsNullOrWhiteSpace(product.Brand))
                attributes.Add(new { id = "BRAND", value_name = product.Brand });
            if (!string.IsNullOrWhiteSpace(variant.Sku))
                attributes.Add(new { id = "SELLER_SKU", value_name = variant.Sku });
            if (attributes.Count > 0) payload["attributes"] = attributes;

            try
            {
                using var doc = await client.PostAsync(token, "/items", payload, ct);
                var itemId = JsonRead.GetString(doc.RootElement, "id") ?? "";
                var permalink = JsonRead.GetString(doc.RootElement, "permalink");

                // Descripción aparte (así lo pide la API de ML).
                if (!string.IsNullOrWhiteSpace(product.Description))
                {
                    try
                    {
                        using var _ = await client.PostAsync(token, $"/items/{itemId}/description",
                            new { plain_text = product.Description }, ct);
                    }
                    catch (MeliException) { /* la publicación ya existe; la descripción se puede editar en ML */ }
                }

                // Auto-vincular: la publicación nace conectada al stock local.
                var link = MeliItemLink.Create(
                    tenant.TenantId.Value, itemId, null, product.Id, variant.Id, product.Name);
                if (link.IsSuccess)
                {
                    link.Value.MarkPushed(available);
                    db.ItemLinks.Add(link.Value);
                    await db.SaveChangesAsync(ct);
                }

                return Results.Ok(new { itemId, permalink });
            }
            catch (MeliException ex)
            {
                return Error.Validation("Meli.PublishFailed", ex.Message).ToProblem();
            }
        });
    }

    // ------------------------------------------------------- Webhook público

    private static void MapWebhook(RouteGroupBuilder group)
    {
        // ML exige 200 en <500 ms: SOLO persistir (inbox durable) y salir.
        // Sin firma criptográfica: nunca se confía en el payload — el worker
        // re-consulta el resource con el token del vendedor.
        group.MapPost("/webhooks/meli", async (HttpRequest http, MeliDbContext db, CancellationToken ct) =>
        {
            using var doc = await JsonDocument.ParseAsync(http.Body, cancellationToken: ct);
            var root = doc.RootElement;
            var topic = JsonRead.GetString(root, "topic") ?? "";
            var resource = JsonRead.GetString(root, "resource") ?? "";
            var userId = JsonRead.GetLongFlexible(root, "user_id");

            if (topic.Length == 0 || resource.Length == 0 || userId == 0)
                return Results.Ok(); // payload raro: ACK igual para que ML no reintente

            db.Notifications.Add(MeliNotification.Receive(topic, resource, userId));
            await db.SaveChangesAsync(ct);
            return Results.Ok();
        });
    }

}

public sealed record MeliSettingsRequest(
    bool StockSyncEnabled, int? StockBufferUnits = null, bool? AutoInvoiceEnabled = null,
    bool? PriceSyncEnabled = null, decimal? PriceMarkupPct = null);
public sealed record MeliAnswerRequest(string Text);
public sealed record MeliSendMessageRequest(string Text);
public sealed record MeliLinkRequest(Guid ProductId, Guid VariantId, long? MeliVariationId, string? Title);
public sealed record MeliPublishRequest(string? CategoryId, Guid? VariantId, string? ListingTypeId);
