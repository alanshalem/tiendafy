using System.Net;
using System.Text;
using Api.Endpoints;
using Api.Reviews;
using Api.Workers;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Notifications.Infrastructure;
using Orders.Core.Domain;
using Orders.Infrastructure.Persistence;
using Reviews.Infrastructure;

namespace Api.Notifications;

/// <summary>
/// Pide la reseña por email unos días después del despacho (los que diga
/// cada tienda en Reseñas → Configuración). Las reseñas casi nunca llegan
/// solas: sin este email, la ficha queda vacía aunque la tienda venda bien.
///
/// <para>
/// Una vez por venta (tabla review_requests), solo ventas despachadas dentro
/// de una ventana corta (no se le escribe por una compra de hace meses: ni el
/// día del deploy, ni si el worker estuvo parado), respetando la lista de
/// bajas y con link de baja propio. La tienda lo apaga desde Reseñas o desde
/// E-mails automáticos (es la plantilla "pedir-resena").
/// </para>
/// </summary>
public sealed class ReviewRequestWorker(
    IServiceScopeFactory scopeFactory,
    ILogger<ReviewRequestWorker> logger) : PollingWorker(TimeSpan.FromHours(1))
{
    /// <summary>Cuánto después del día pactado todavía se manda (worker caído, deploy).</summary>
    private static readonly TimeSpan Window = TimeSpan.FromDays(3);

    /// <summary>Tope por pasada: un lote grande se reparte en varias horas.</summary>
    private const int MaxPerPass = 200;

    protected override void LogPollFailure(Exception ex) =>
        logger.LogError(ex, "Pedidos de reseña fallaron.");

    protected override async Task PollOnceAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var sp = scope.ServiceProvider;
        var ordersDb = sp.GetRequiredService<OrdersDbContext>();
        var reviewsDb = sp.GetRequiredService<ReviewsDbContext>();

        var now = DateTime.UtcNow;

        // Qué tiendas despacharon algo en el rango más amplio posible (la demora
        // máxima configurable); después, cada una con SU demora y una ventana
        // corta: así la consulta trae pocos días de ventas por tienda.
        var oldest = now.AddDays(-ReviewSettings.MaxRequestDelayDays) - Window;
        var tenantIds = await ordersDb.Orders.IgnoreQueryFilters().AsNoTracking()
            .Where(o => o.FulfilledAtUtc != null && o.FulfilledAtUtc >= oldest)
            .Select(o => o.TenantId)
            .Distinct()
            .ToListAsync(ct);
        if (tenantIds.Count == 0) return;

        var tenantGuids = tenantIds.Select(t => t.Value).ToList();
        var settings = (await reviewsDb.Settings.IgnoreQueryFilters().AsNoTracking()
                .Where(s => tenantGuids.Contains(s.TenantId))
                .ToListAsync(ct))
            .ToDictionary(s => s.TenantId);

        var due = new List<Order>();
        foreach (var tenantId in tenantIds)
        {
            if (due.Count >= MaxPerPass) break;
            var delay = settings.TryGetValue(tenantId.Value, out var s) ? s.RequestDelayDays : ReviewSettings.DefaultRequestDelayDays;
            var to = now.AddDays(-delay);
            var from = to - Window;

            var orders = await ordersDb.Orders.IgnoreQueryFilters().AsNoTracking()
                .Where(o => o.TenantId == tenantId && o.FulfilledAtUtc != null
                    && o.FulfilledAtUtc >= from && o.FulfilledAtUtc <= to
                    && (o.Status == OrderStatus.Fulfilled || o.Status == OrderStatus.PartiallyRefunded))
                // Sin Take: la ventana es de pocos días, y cortar antes de sacar
                // las ya pedidas trabaría las nuevas detrás de las viejas.
                .OrderBy(o => o.FulfilledAtUtc)
                .ToListAsync(ct);
            if (orders.Count == 0) continue;

            var ids = orders.Select(o => o.Id).ToList();
            var done = (await reviewsDb.Requests.IgnoreQueryFilters().AsNoTracking()
                .Where(r => r.TenantId == tenantId.Value && ids.Contains(r.OrderId))
                .Select(r => r.OrderId)
                .ToListAsync(ct)).ToHashSet();
            due.AddRange(orders.Where(o => !done.Contains(o.Id)).Take(MaxPerPass - due.Count));
        }
        if (due.Count == 0) return;

        var sent = 0;
        foreach (var tenantOrders in due.GroupBy(o => o.TenantId.Value))
        {
            try { sent += await RunTenantAsync(sp, reviewsDb, tenantOrders.Key, [.. tenantOrders], ct); }
            catch (Exception ex)
            {
                logger.LogError(ex, "Pedidos de reseña fallaron para el tenant {TenantId}.", tenantOrders.Key);
            }
        }
        if (sent > 0) logger.LogInformation("Pedidos de reseña: {Sent} emails enviados.", sent);
    }

    private async Task<int> RunTenantAsync(
        IServiceProvider sp, ReviewsDbContext reviewsDb, Guid tenantId, List<Order> orders, CancellationToken ct)
    {
        var links = sp.GetRequiredService<StoreLinks>();
        if (await links.ForTenantAsync(tenantId, "https", ct) is not { } store) return 0;
        var storeUrl = store.Url;
        var apiBase = links.ApiBase;

        var suppressed = (await sp.GetRequiredService<NotificationsDbContext>().EmailSuppressions
                .IgnoreQueryFilters().AsNoTracking()
                .Where(s => s.TenantId == tenantId)
                .Select(s => s.Email)
                .ToListAsync(ct))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var templates = sp.GetRequiredService<IEmailTemplates>();
        var sender = sp.GetRequiredService<BrandedEmailSender>();
        var images = sp.GetRequiredService<OrderItemImages>();
        var dp = sp.GetRequiredService<IDataProtectionProvider>();
        var sent = 0;

        foreach (var order in orders)
        {
            string outcome;
            if (suppressed.Contains(order.BuyerEmail))
            {
                outcome = "suppressed";
            }
            else
            {
                var token = ReviewInviteToken.Protect(dp, tenantId, order.Id);
                var vars = new Dictionary<string, string>
                {
                    ["store"] = Enc(store.Name),
                    ["name"] = Enc(FirstName(order.BuyerName)),
                    ["order_id"] = Enc(order.Id.ToString()),
                    ["items"] = ItemsList(order, await images.ForOrderAsync(order, ct)),
                    ["link"] = $"{storeUrl}/resenas/escribir?t={Uri.EscapeDataString(token)}",
                };

                var rendered = await templates.RenderAsync(tenantId, ReviewEndpoints.ReviewRequestTemplate, vars, ct);
                if (rendered is not { Enabled: true })
                {
                    // Apagado: no se marca, así si la tienda lo prende en estos
                    // días todavía le llega a quien esté dentro de la ventana.
                    continue;
                }

                var html = rendered.Html + UnsubscribeToken.Footer(dp, apiBase, tenantId, order.BuyerEmail);
                await sender.SendAsync(tenantId, order.BuyerEmail, rendered.Subject, html, ct, ReviewEndpoints.ReviewRequestTemplate);
                outcome = "sent";
                sent++;
            }

            reviewsDb.Requests.Add(ReviewRequest.Create(tenantId, order.Id, outcome));
            await reviewsDb.SaveChangesAsync(ct);
        }
        return sent;
    }

    private static string Enc(string? s) => WebUtility.HtmlEncode(s ?? string.Empty);

    private static string FirstName(string? fullName) =>
        (fullName ?? string.Empty).Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? "¡hola!";

    /// <summary>Lo que compró, con foto: recordar QUÉ se le pide que opine.</summary>
    private static string ItemsList(Order order, IReadOnlyDictionary<Guid, string> images)
    {
        var sb = new StringBuilder("<table role='presentation' style='width:100%;border-collapse:collapse;font-size:14px;margin:8px 0 16px'>");
        foreach (var item in order.Items.DistinctBy(i => i.VariantId))
        {
            sb.Append("<tr>");
            if (images.TryGetValue(item.VariantId, out var img))
                sb.Append("<td style='padding:6px 12px 6px 0;width:56px'><img src='").Append(Enc(img))
                  .Append("' alt='' width='48' height='48' style='width:48px;height:48px;object-fit:cover;border-radius:6px;display:block'/></td>");
            sb.Append("<td style='padding:6px 0'>").Append(Enc(item.ProductName));
            if (!string.IsNullOrWhiteSpace(item.VariantDescription) && item.VariantDescription != "Única")
                sb.Append("<br/><span style='color:#8b8b8b;font-size:12px'>").Append(Enc(item.VariantDescription)).Append("</span>");
            sb.Append("</td></tr>");
        }
        return sb.Append("</table>").ToString();
    }
}
