using System.Net;
using System.Text;
using Api.Workers;
using Checkout.Core.Domain;
using Checkout.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Notifications.Infrastructure;
using Orders.Core.Domain;
using Orders.Infrastructure.Persistence;
using Tenancy.Infrastructure.Persistence;

namespace Api.Notifications;

/// <summary>
/// Recuperación de carritos abandonados: cada cierto tiempo busca checkouts con
/// email, no pagados, abandonados hace un rato, y manda UN email con link a la
/// tienda. Marca el envío para no repetir.
///
/// <para>
/// El email sale con la plantilla "carritos-abandonados" de la tienda (asunto,
/// texto y si está prendida) y nunca a una dirección de la lista de supresión:
/// es marketing, y quien se dio de baja, rebotó o marcó spam no lo recibe.
/// Antes salía con un texto fijo, para todas las tiendas y sin mirar la lista.
/// </para>
/// </summary>
public sealed class AbandonedCartWorker(
    IServiceScopeFactory scopeFactory,
    ILogger<AbandonedCartWorker> logger) : PollingWorker(TimeSpan.FromMinutes(15))
{
    public const string Template = "carritos-abandonados";

    private static readonly TimeSpan MinAge = TimeSpan.FromHours(1);  // esperar 1h tras abandono
    private static readonly TimeSpan MaxAge = TimeSpan.FromDays(7);   // no perseguir carritos viejos

    protected override void LogPollFailure(Exception ex) =>
        logger.LogError(ex, "Recuperación de carritos falló.");

    protected override async Task PollOnceAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var sp = scope.ServiceProvider;
        var checkoutDb = sp.GetRequiredService<CheckoutDbContext>();
        var ordersDb = sp.GetRequiredService<OrdersDbContext>();
        var tenancy = sp.GetRequiredService<TenancyDbContext>();
        var email = sp.GetRequiredService<BrandedEmailSender>();
        var templates = sp.GetRequiredService<IEmailTemplates>();

        var now = DateTime.UtcNow;
        var oldest = now - MaxAge;
        var newest = now - MinAge;

        var candidates = await checkoutDb.Sessions
            .Where(s => s.Email != null
                && s.RecoveryEmailSentAtUtc == null
                && s.Status != CheckoutStatus.Completed
                && s.CreatedAtUtc >= oldest && s.CreatedAtUtc <= newest)
            .OrderBy(s => s.CreatedAtUtc)
            .Take(50)
            .ToListAsync(ct);
        if (candidates.Count == 0) return;

        // Sacar las que terminaron en una orden pagada.
        var ids = candidates.Select(s => s.Id).ToList();
        var paid = (await ordersDb.Orders
            .Where(o => OrderStatuses.Earning.Contains(o.Status) && ids.Contains(o.CheckoutSessionId))
            .Select(o => o.CheckoutSessionId)
            .ToListAsync(ct)).ToHashSet();

        // Datos de tienda (nombre + URL pública) para los tenants involucrados.
        var tenantGuids = candidates.Select(s => s.TenantId.Value).Distinct().ToList();
        var tenantList = await tenancy.Tenants.AsNoTracking()
            .Where(t => tenantGuids.Contains(t.Id))
            .ToListAsync(ct);
        // Mapear en memoria (el VO Subdomain.Value no se traduce bien en SQL).
        var byTenant = tenantList.ToDictionary(
            t => t.Id,
            t => (Name: t.Name, Subdomain: t.Subdomain.Value, CustomDomain: t.CustomDomain));
        var links = sp.GetRequiredService<StoreLinks>();

        // Lista de supresión de cada tienda, solo para las direcciones de esta
        // pasada (se guardan en minúsculas).
        var addresses = candidates.Select(s => s.Email!.Trim().ToLowerInvariant()).Distinct().ToList();
        var suppressed = (await sp.GetRequiredService<NotificationsDbContext>().EmailSuppressions
                .IgnoreQueryFilters().AsNoTracking()
                .Where(x => tenantGuids.Contains(x.TenantId) && addresses.Contains(x.Email))
                .Select(x => new { x.TenantId, x.Email })
                .ToListAsync(ct))
            .Select(x => (x.TenantId, x.Email))
            .ToHashSet();

        var sent = 0;
        foreach (var s in candidates)
        {
            if (paid.Contains(s.Id)) { s.MarkRecoveryEmailed(); continue; } // ya compró: no perseguir
            if (!byTenant.TryGetValue(s.TenantId.Value, out var t)) continue;

            var to = s.Email!.Trim();
            var unsubscribed = suppressed.Contains((s.TenantId.Value, to.ToLowerInvariant()));
            if (!unsubscribed && !BrandedEmailSender.IsPlaceholder(to))
            {
                var storeUrl = links.For(t.CustomDomain, t.Subdomain, "https");
                var rendered = await templates.RenderAsync(s.TenantId.Value, Template, new Dictionary<string, string>
                {
                    ["store"] = WebUtility.HtmlEncode(t.Name),
                    ["name"] = WebUtility.HtmlEncode(s.BuyerName ?? string.Empty),
                    ["items"] = ItemsList(s),
                    ["link"] = WebUtility.HtmlEncode(storeUrl),
                }, ct);
                // Apagada por la tienda: no sale el email (WhatsApp va por su lado).
                if (rendered is { Enabled: true }
                    && await email.SendAsync(s.TenantId.Value, to, rendered.Subject, rendered.Html, ct, Template))
                    sent++;
            }
            // WhatsApp solo si la sesión llegó a cargar teléfono (paso Entrega),
            // la tienda tiene la plantilla de carrito abandonado activada y el
            // comprador dio su consentimiento: tildó "Quiero recibir novedades"
            // en el checkout y no se dio de baja de las novedades de la tienda
            // (la misma lista de supresión que el email). Meta lo cuenta como
            // marketing y exige que la persona haya aceptado; antes salía a
            // cualquiera que hubiera dejado su teléfono para el envío.
            if (s.AcceptsMarketing && !unsubscribed)
                await sp.GetRequiredService<WhatsAppNotifier>().NotifyAbandonedCartAsync(
                    s.TenantId.Value, s.Phone, s.BuyerName ?? "cliente", t.Name, ct);
            s.MarkRecoveryEmailed();
        }

        await checkoutDb.SaveChangesAsync(ct);
        if (sent > 0) logger.LogInformation("Recuperación de carritos: {Sent} emails enviados.", sent);
    }

    /// <summary>{{items}}: lo que quedó en el carrito (nombre, variante, cantidad y precio).</summary>
    private static string ItemsList(CheckoutSession s)
    {
        var sb = new StringBuilder("<table role='presentation' style='width:100%;border-collapse:collapse;font-size:14px;margin:12px 0'>");
        foreach (var i in s.Items)
        {
            sb.Append("<tr style='border-bottom:1px solid #f0f0f0'><td style='padding:8px 0'>")
              .Append(WebUtility.HtmlEncode(i.ProductName));
            if (!string.IsNullOrWhiteSpace(i.VariantDescription) && i.VariantDescription != "Única")
                sb.Append("<br/><span style='color:#8b8b8b;font-size:12px'>").Append(WebUtility.HtmlEncode(i.VariantDescription)).Append("</span>");
            sb.Append("<br/><span style='color:#8b8b8b;font-size:12px'>x").Append(i.Quantity).Append("</span></td>")
              .Append("<td style='padding:8px 0;text-align:right;white-space:nowrap;vertical-align:top'>")
              .Append(WebUtility.HtmlEncode(MoneyFormat.ForNotification(i.UnitPrice * i.Quantity))).Append("</td></tr>");
        }
        return sb.Append("</table>").ToString();
    }
}
