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
        var config = group.MapGroup("/admin/meli").RequirePermission(Permission.MeliConfig);

        // Además de la configuración, lo que hace falta para saber si la
        // integración está haciendo algo: cuántas publicaciones hay vinculadas
        // (sin vínculos, los interruptores de stock y precio no tocan nada) y
        // cuándo fue la última señal de vida de Mercado Libre.
        config.MapGet("/connection", async (
            ITenantContext tenant, MeliDbContext db, IOptions<MeliOptions> options, CancellationToken ct) =>
        {
            var c = await db.Connections.AsNoTracking().FirstOrDefaultAsync(ct);

            var links = c is null
                ? null
                : await db.ItemLinks.AsNoTracking()
                    .GroupBy(_ => 1)
                    .Select(g => new
                    {
                        total = g.Count(),
                        stock = g.Count(x => x.SyncStock),
                        price = g.Count(x => x.SyncPrice),
                    })
                    .FirstOrDefaultAsync(ct);

            var orders = c is null
                ? null
                : await db.Orders.AsNoTracking()
                    .GroupBy(_ => 1)
                    .Select(g => new { total = g.Count(), last = (DateTime?)g.Max(x => x.DateCreatedUtc) })
                    .FirstOrDefaultAsync(ct);

            var notifications = c is null
                ? null
                : await db.Notifications.AsNoTracking()
                    .GroupBy(_ => 1)
                    .Select(g => new
                    {
                        last = (DateTime?)g.Max(x => x.CreatedAtUtc),
                        stuck = g.Count(x => x.Status == InboxEntry.StatusDead),
                    })
                    .FirstOrDefaultAsync(ct);

            return Results.Ok(new
            {
                available = options.Value.Configured,
                connected = c is not null,
                isDemo = c?.IsDemo ?? false,
                nickname = c?.Nickname,
                meliUserId = c?.MeliUserId,
                siteId = c?.SiteId,
                stockSyncEnabled = c?.StockSyncEnabled ?? false,
                stockBufferUnits = c?.StockBufferUnits ?? 0,
                priceSyncEnabled = c?.PriceSyncEnabled ?? false,
                priceMarkupPct = c?.PriceMarkupPct ?? 0m,
                autoInvoiceEnabled = c?.AutoInvoiceEnabled ?? false,
                connectedAtUtc = c?.ConnectedAtUtc,
                linkedItems = links?.total ?? 0,
                linkedStock = links?.stock ?? 0,
                linkedPrice = links?.price ?? 0,
                ordersImported = orders?.total ?? 0,
                lastOrderAtUtc = orders?.last,
                lastNotificationAtUtc = notifications?.last,
                stuckNotifications = notifications?.stuck ?? 0,
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

            // Con una cuenta de ejemplo no hay a dónde ir a buscar: el token es
            // falso y salir a la API terminaría en un 401 y un cartel de error.
            if (c.IsDemo) return Results.Ok(new { imported = 0, demo = true });

            try
            {
                var count = await sync.BackfillOrdersAsync(c.TenantId, c.MeliUserId, ct);
                return Results.Ok(new { imported = count, demo = false });
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
        var sales = group.MapGroup("/admin/meli").RequirePermission(Permission.MeliOperate);

        // Estado liviano para la página del canal (sin exponer configuración).
        // Si la cuenta está conectada: lo necesitan quien atiende y quien publica.
        group.MapGet("/admin/meli/status", async (ITenantContext tenant, MeliDbContext db, CancellationToken ct) =>
        {
            var c = await db.Connections.AsNoTracking().FirstOrDefaultAsync(ct);
            return Results.Ok(new { connected = c is not null, nickname = c?.Nickname });
        }).RequireAnyPermission(Permission.MeliOperate, Permission.MeliPublish);

        // Ventas del cache local (rápido; el webhook + refresh lo mantienen al día).
        // Busca por comprador, número de venta o producto, y filtra por estado
        // de cobro y de facturación (ver MeliOrderFilters).
        sales.MapGet("/orders", async (
            ITenantContext tenant, MeliDbContext db, global::Fiscal.Infrastructure.Persistence.FiscalDbContext fiscalDb,
            int? offset, int? limit, string? q, string? estado, CancellationToken ct) =>
        {
            var take = Math.Clamp(limit ?? 25, 1, 100);
            var skip = Math.Max(0, offset ?? 0);

            // Facturada = con factura del ambiente actual: una de homologación
            // no cuenta en producción (la venta se puede facturar de verdad).
            var notCounting = await MeliInvoices.NotCountingAsync(fiscalDb, tenant.TenantId.Value, ct);
            var query = MeliOrderFilters.Apply(db, q, estado, notCounting)
                .OrderByDescending(o => o.DateCreatedUtc);
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
                    // Lo que pasó de verdad con el stock local: descontado (con
                    // la sincronización de stock prendida) y, si se canceló,
                    // devuelto. Una venta procesada con la sincronización
                    // apagada no descontó nada y no dice que sí.
                    stockDiscounted = o.StockDiscounted,
                    stockReturned = o.StockReverted,
                    // La factura del ambiente actual (null si no tiene, o si la
                    // que tiene es de otro ambiente).
                    fiscalDocumentId = notCounting.Contains(o.FiscalDocumentId) ? null : o.FiscalDocumentId,
                }),
            });
        });

        // Métricas para Estadísticas (multicanal): ventas ML del período.
        sales.MapGet("/stats", async (
            ITenantContext tenant, MeliDbContext db, int? days, CancellationToken ct) =>
        {
            var since = DateTime.UtcNow.AddDays(-Math.Clamp(days ?? 30, 1, 365));

            var paid = await db.Orders.AsNoTracking()
                .Where(o => o.DateCreatedUtc >= since && MeliOrder.EarningStatuses.Contains(o.Status))
                .ToListAsync(ct);

            return Results.Ok(new
            {
                connected = await db.Connections.AsNoTracking().AnyAsync(ct),
                orders = paid.Count,
                revenue = paid.Sum(o => o.BillableAmount),
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
                var raw = root.TryGetProperty("questions", out var qs) && qs.ValueKind == JsonValueKind.Array
                    ? qs.EnumerateArray().ToList()
                    : [];

                // Contestar sin ver de qué publicación es obliga a abrir ML en
                // otra pestaña: se trae título, foto, precio y stock de cada
                // publicación (de a 20 por pedido, el tope del multiget).
                var items = await ItemSummariesAsync(client, token,
                    raw.Select(q => JsonRead.GetString(q, "item_id")), ct);

                var questions = raw.Select(q =>
                {
                    var itemId = JsonRead.GetString(q, "item_id");
                    return (object)new
                    {
                        id = q.TryGetProperty("id", out var id) ? id.GetInt64() : 0,
                        text = JsonRead.GetString(q, "text"),
                        status = JsonRead.GetString(q, "status"),
                        itemId,
                        item = itemId is not null ? items.GetValueOrDefault(itemId) : null,
                        dateCreated = JsonRead.GetString(q, "date_created"),
                        answer = q.TryGetProperty("answer", out var a) && a.ValueKind == JsonValueKind.Object
                            ? new { text = JsonRead.GetString(a, "text"), dateCreated = JsonRead.GetString(a, "date_created") }
                            : null,
                    };
                }).ToArray();
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
            global::Fiscal.Infrastructure.Persistence.FiscalDbContext fiscalDb,
            global::Fiscal.Core.Abstractions.IInvoiceEmitter emitter, CancellationToken ct) =>
        {
            var order = await db.Orders.FirstOrDefaultAsync(o => o.MeliOrderId == meliOrderId, ct);
            if (order is null)
                return Error.NotFound("Meli.OrderNotFound", "Esa venta no existe.").ToProblem();
            if (!order.IsPaid)
                return Error.Validation("Meli.NotPaid", "Solo se facturan ventas pagadas.").ToProblem();
            // Ya facturada en el ambiente en que factura hoy la tienda. Una de
            // homologación no cuenta en producción: se puede facturar de verdad.
            if (await MeliInvoices.CountsAsync(fiscalDb, tenant.TenantId.Value, order.FiscalDocumentId, ct))
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
                // El motivo suele venir en las observaciones (10015 "DocNro inválido"…),
                // no en los errores: sin ellas el comercio veía un rechazo sin explicación.
                var reasons = r.Errors.Concat(r.Observations).ToList();
                var detail = reasons.Count > 0
                    ? string.Join("; ", reasons.Select(e => $"{e.Code} {e.Message}"))
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

        var actions = group.MapGroup("/admin/meli").RequirePermission(Permission.MeliOperate);

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

        // Mensajería posventa por pack: leer y escribir piden meli.operate (quien
        // atiende las ventas de ML)…
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

        // …igual que contestar. El buyer se valida contra el cache local (nunca
        // se manda un mensaje a un user arbitrario del request).
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

        // Reclamos post-venta (proxy en vivo), de a una página: ML pagina con
        // offset/limit y dice el total en `paging`. Antes se pedían los 30 más
        // nuevos y el resto no existía para el panel.
        sales.MapGet("/claims", async (
            ITenantContext tenant, MeliDbContext db, MeliTokenService tokens, MeliClient client, CancellationToken ct,
            int? offset = null, int? limit = null) =>
        {
            var (skip, take) = Paging.Window(offset, limit, defaultLimit: 25, maxLimit: MeliPageLimit);
            if (await IsDemoAsync(db, ct)) return Results.Ok(MeliDemoFeed.Claims(skip, take));

            var resolved = await ResolveConnectionAsync(db, tokens, ct);
            if (resolved is null) return Results.Ok(new { claims = Array.Empty<object>(), total = 0 });
            var (c, token) = resolved.Value;

            try
            {
                using var doc = await client.GetAsync(token, $"/post-purchase/v1/claims/search?offset={skip}&limit={take}", ct);
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
                return Results.Ok(new { claims, total = PagingTotal(root, skip + claims.Length) });
            }
            catch (MeliException)
            {
                // El recurso de claims varía por site/cuenta: sin reclamos ≠ error del panel.
                return Results.Ok(new { claims = Array.Empty<object>(), total = 0 });
            }
        });
    }

    /// <summary>
    /// Título, foto, precio y stock de las publicaciones pedidas, por id. Es
    /// un agregado para mostrar: si ML no contesta, las preguntas salen igual
    /// (sin la ficha) en vez de dejar la pantalla en error.
    /// </summary>
    private static async Task<Dictionary<string, MeliItemSummary>> ItemSummariesAsync(
        MeliClient client, string token, IEnumerable<string?> itemIds, CancellationToken ct)
    {
        var result = new Dictionary<string, MeliItemSummary>(StringComparer.OrdinalIgnoreCase);
        var ids = itemIds.Where(id => !string.IsNullOrWhiteSpace(id)).Select(id => id!)
            .Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        foreach (var chunk in ids.Chunk(20))
        {
            try
            {
                using var doc = await client.GetAsync(token,
                    $"/items?ids={string.Join(',', chunk)}&attributes=id,title,thumbnail,price,currency_id,available_quantity,permalink,status",
                    ct);
                if (doc.RootElement.ValueKind != JsonValueKind.Array) continue;
                foreach (var wrapper in doc.RootElement.EnumerateArray())
                {
                    if (!wrapper.TryGetProperty("body", out var item) || item.ValueKind != JsonValueKind.Object) continue;
                    var summary = MeliItemSummary.From(item);
                    if (summary is not null) result[summary.Id] = summary;
                }
            }
            catch (MeliException)
            {
                // Sin la ficha de estas publicaciones; las preguntas siguen.
            }
        }
        return result;
    }

    /// <summary>
    /// Lo más que se le pide a Mercado Libre por página: sus búsquedas no dan
    /// más de 50 resultados por pedido.
    /// </summary>
    private const int MeliPageLimit = 50;

    /// <summary>
    /// El total que informa ML en <c>paging.total</c>. Si no viene (una cuenta
    /// o un recurso que no lo manda), lo que se sabe: hasta acá.
    /// </summary>
    private static int PagingTotal(JsonElement root, int fallback) =>
        root.ValueKind == JsonValueKind.Object
        && root.TryGetProperty("paging", out var paging) && paging.ValueKind == JsonValueKind.Object
        && paging.TryGetProperty("total", out var total) && total.TryGetInt32(out var value)
            ? value
            : fallback;

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
        var items = group.MapGroup("/admin/meli").RequirePermission(Permission.MeliPublish);

        // Publicaciones del vendedor + estado de vínculo con el catálogo local,
        // de a una página. Antes se pedían las 50 primeras y la publicación 51
        // no se podía ni vincular.
        items.MapGet("/items", async (
            ITenantContext tenant, MeliDbContext db, MeliTokenService tokens, MeliClient client, CancellationToken ct,
            int? offset = null, int? limit = null) =>
        {
            var (skip, take) = Paging.Window(offset, limit, defaultLimit: 25, maxLimit: MeliPageLimit);
            if (await IsDemoAsync(db, ct))
                return Results.Ok(MeliDemoFeed.ItemsWithLinks(await db.ItemLinks.AsNoTracking().ToListAsync(ct), skip, take));

            var resolved = await ResolveConnectionAsync(db, tokens, ct);
            if (resolved is null) return Results.Ok(new { items = Array.Empty<object>(), total = 0 });
            var (c, token) = resolved.Value;

            try
            {
                using var search = await client.GetAsync(token,
                    $"/users/{c.MeliUserId}/items/search?offset={skip}&limit={take}", ct);
                var ids = search.RootElement.TryGetProperty("results", out var res) && res.ValueKind == JsonValueKind.Array
                    ? res.EnumerateArray().Select(e => e.GetString()).Where(s => !string.IsNullOrEmpty(s)).ToList()
                    : [];
                var total = PagingTotal(search.RootElement, skip + ids.Count);
                if (ids.Count == 0) return Results.Ok(new { items = Array.Empty<object>(), total });

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
                            thumbnail = MeliItemSummary.SecureThumbnail(JsonRead.GetString(item, "thumbnail")),
                            price = JsonRead.GetDecimal(item, "price"),
                            availableQuantity = JsonRead.GetInt32(item, "available_quantity"),
                            link = link is null ? null : MeliItemLinkDto.From(link),
                        });
                    }
                }
                return Results.Ok(new { items = result, total });
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

        // Qué se sincroniza de UNA publicación vinculada: stock, precio o los
        // dos. El interruptor de la conexión manda sobre este (apagado allá,
        // no viaja nada); este sirve para dejar afuera una publicación puntual
        // (una con precio promocional cargado a mano en ML, por ejemplo). No
        // escribe en Mercado Libre: vale también para la cuenta de ejemplo.
        items.MapPut("/items/{itemId}/sync", async (
            string itemId, MeliLinkSyncRequest request, MeliDbContext db, CancellationToken ct) =>
        {
            var normalized = itemId.Trim().ToUpperInvariant();
            var link = await db.ItemLinks.FirstOrDefaultAsync(
                l => l.MeliItemId == normalized && l.MeliVariationId == request.MeliVariationId, ct);
            if (link is null)
                return Error.NotFound("Meli.LinkNotFound", "Esa publicación no está vinculada a tu catálogo.").ToProblem();

            if (request.SyncStock is { } stock) link.SetSyncStock(stock);
            if (request.SyncPrice is { } price) link.SetSyncPrice(price);
            await db.SaveChangesAsync(ct);
            return Results.Ok(MeliItemLinkDto.From(link));
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
            IProductRepository products, IStockRepository stock,
            Catalog.Infrastructure.Persistence.CatalogDbContext catalogDb, CancellationToken ct) =>
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

            // Atributos de ML declarados en la ficha técnica (solo si el producto tiene ficha).
            var specAttributeIds = product.Specs.Count > 0
                ? await catalogDb.SpecDefinitions.AsNoTracking()
                    .Where(d => d.TenantId == product.TenantId && d.MeliAttributeId != null)
                    .Select(d => new { d.Id, d.MeliAttributeId })
                    .ToDictionaryAsync(d => d.Id, d => d.MeliAttributeId!, ct)
                : [];
            var built = MeliListingPayload.Build(
                product, variant, c, request.CategoryId, request.ListingTypeId, available, specAttributeIds);
            if (built.IsFailure) return built.Error.ToProblem();
            var listing = built.Value;

            try
            {
                using var doc = await client.PostAsync(token, "/items", listing.Payload, ct);
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
                    // Lo que viajó (disponible − colchón), no el disponible local:
                    // si no, la primera pasada del worker lo PUTeaba de nuevo.
                    link.Value.MarkPushed(listing.Quantity);
                    // Ya salió con el precio del canal: el worker no lo vuelve a empujar.
                    link.Value.MarkPricePushed(listing.PriceMinor);
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
        // ML pide un 200 enseguida (20 s de plazo; si no, reintenta y al
        // final descarta el aviso): SOLO persistir (inbox durable) y salir.
        // Sin firma criptográfica: nunca se confía en el payload — el worker
        // re-consulta el resource con el token del vendedor.
        group.MapPost("/webhooks/meli", async (
            HttpRequest http, MeliDbContext db, ILoggerFactory loggerFactory, CancellationToken ct) =>
        {
            // Un cuerpo que no es JSON (o no es un objeto) se contesta 200 y se
            // descarta, igual que un aviso incompleto. Antes reventaba con 500.
            // No es un 400 a propósito: ML trata todo lo que no sea 200 como
            // aviso fallido y lo reintenta durante horas, y un cuerpo roto no
            // se arregla reintentando; solo sumaría errores a la URL de avisos.
            // Si de verdad era una venta, la trae el backfill ("Actualizar").
            JsonDocument doc;
            try
            {
                doc = await JsonDocument.ParseAsync(http.Body, cancellationToken: ct);
            }
            catch (JsonException)
            {
                loggerFactory.CreateLogger("MeliWebhook").LogWarning("Aviso de Mercado Libre con JSON inválido: se descarta.");
                return Results.Ok();
            }

            using var _ = doc;
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return Results.Ok();
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

/// <summary>Lo que el panel muestra de una publicación al lado de una pregunta.</summary>
public sealed record MeliItemSummary(
    string Id, string? Title, string? Thumbnail, decimal Price, string? CurrencyId,
    int AvailableQuantity, string? Permalink, string? Status)
{
    public static MeliItemSummary? From(JsonElement item)
    {
        var id = JsonRead.GetString(item, "id");
        if (string.IsNullOrWhiteSpace(id)) return null;
        return new MeliItemSummary(
            id,
            JsonRead.GetString(item, "title"),
            SecureThumbnail(JsonRead.GetString(item, "thumbnail")),
            JsonRead.GetDecimal(item, "price"),
            JsonRead.GetString(item, "currency_id"),
            JsonRead.GetInt32(item, "available_quantity"),
            JsonRead.GetString(item, "permalink"),
            JsonRead.GetString(item, "status"));
    }

    /// <summary>
    /// ML todavía devuelve miniaturas por http, y el panel corre en https: el
    /// navegador las bloquea (contenido mixto). Las mismas imágenes se sirven
    /// por https.
    /// </summary>
    public static string? SecureThumbnail(string? url) =>
        url is not null && url.StartsWith("http://", StringComparison.OrdinalIgnoreCase)
            ? "https://" + url["http://".Length..]
            : url;
}
public sealed record MeliSendMessageRequest(string Text);
public sealed record MeliLinkRequest(Guid ProductId, Guid VariantId, long? MeliVariationId, string? Title);
/// <summary>Switches de una publicación; null = no se toca.</summary>
public sealed record MeliLinkSyncRequest(long? MeliVariationId, bool? SyncStock, bool? SyncPrice);
public sealed record MeliPublishRequest(string? CategoryId, Guid? VariantId, string? ListingTypeId);
