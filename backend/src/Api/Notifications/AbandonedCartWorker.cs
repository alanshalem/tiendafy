using System.Net;
using System.Text;
using Api.Workers;
using Checkout.Core.Domain;
using Checkout.Infrastructure.Persistence;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Notifications.Infrastructure;
using Orders.Infrastructure.Persistence;
using Tenancy.Infrastructure.Persistence;

namespace Api.Notifications;

/// <summary>
/// Recuperación de carritos abandonados: cada cierto tiempo busca checkouts con
/// email que el comprador dejó hace un rato sin comprar, y le manda UN
/// recordatorio con link a la tienda. Marca la sesión para no repetir.
///
/// <para>
/// El email lo recibe todo el que dejó su email en el checkout (lo deja apenas
/// lo escribe, ver <c>POST /checkout/contact</c>): el checkout le avisa ahí
/// mismo que, si deja la compra sin terminar, le mandamos un recordatorio, y
/// el email trae el link para darse de baja. Sale con la plantilla
/// "carritos-abandonados" de la tienda (asunto, texto y si está prendida) y
/// nunca a una dirección de la lista de supresión: quien se dio de baja, rebotó
/// o marcó spam no lo recibe.
/// </para>
/// <para>
/// El WhatsApp, en cambio, solo a quien tildó el aviso por WhatsApp junto al
/// teléfono: Meta lo cuenta como marketing y exige ese permiso.
/// </para>
/// <para>
/// Uno por comprador y por intento: si compró después (con esta compra o con
/// otra), o hay una compra suya más nueva en la tienda, esta no se recuerda
/// (ver <see cref="AbandonedCarts"/>).
/// </para>
/// </summary>
public sealed class AbandonedCartWorker(
    IServiceScopeFactory scopeFactory,
    ILogger<AbandonedCartWorker> logger) : PollingWorker(TimeSpan.FromMinutes(15))
{
    public const string Template = WhatsAppNotifier.AbandonedCartType;

    private static readonly TimeSpan MinAge = TimeSpan.FromHours(1);  // 1 h sin que el comprador toque nada
    private static readonly TimeSpan MaxAge = TimeSpan.FromDays(7);   // no perseguir carritos viejos
    private static readonly TimeSpan ReminderEvery = TimeSpan.FromDays(7); // uno por email y tienda

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
        // Corre sin tienda en el scope: las búsquedas recorren todas a propósito
        // (IgnoreQueryFilters) y cada compra se avisa con su tienda fijada.
        var tenantScope = sp.GetRequiredService<Api.Middleware.TenantContextHolder>();

        var now = DateTime.UtcNow;
        var oldest = now - MaxAge;
        var newest = now - MinAge;

        // La espera se cuenta desde lo último que hizo el comprador, no desde
        // que armó la compra: el email llega apenas lo escribe, y alguien que
        // sigue completando el checkout no abandonó nada.
        var candidates = await checkoutDb.Sessions.IgnoreQueryFilters()
            .Where(s => s.Email != null
                && s.RecoveryEmailSentAtUtc == null
                && s.Status != CheckoutStatus.Completed
                && s.CreatedAtUtc >= oldest && s.LastActivityAtUtc <= newest)
            .OrderBy(s => s.CreatedAtUtc)
            .Take(50)
            .ToListAsync(ct);
        if (candidates.Count == 0) return;

        var outcomes = await AbandonedCarts.ClassifyAsync(candidates, checkoutDb, ordersDb, ct);
        var dp = sp.GetRequiredService<IDataProtectionProvider>();

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

        // Un recordatorio por email y tienda por período: el checkout guarda el
        // email apenas se escribe, sin verificarlo, así que sin tope alguien
        // podía hacerle llegar uno tras otro a una casilla ajena armando
        // compras a su nombre. Cuenta lo que salió de verdad, no lo resuelto
        // sin mandar (compró, o había una compra suya más nueva).
        var remindedSince = now - ReminderEvery;
        var recentlyReminded = (await checkoutDb.Sessions.IgnoreQueryFilters().AsNoTracking()
                .Where(s => s.RecoveryReminderSentAtUtc != null && s.RecoveryReminderSentAtUtc >= remindedSince
                    && s.Email != null && addresses.Contains(s.Email.ToLower()))
                .Select(s => new { s.TenantId, s.Email })
                .ToListAsync(ct))
            .Select(x => (x.TenantId.Value, x.Email!.Trim().ToLowerInvariant()))
            .ToHashSet();

        var sent = 0;
        foreach (var s in candidates)
        {
            tenantScope.Set(s.TenantId);
            // Compró, o el recordatorio es de una compra suya más nueva.
            if (outcomes[s.Id] != AbandonedCarts.Outcome.Abandoned) { s.MarkRecoveryEmailed(); continue; }
            if (!byTenant.TryGetValue(s.TenantId.Value, out var t)) continue;

            var to = s.Email!.Trim();
            var key = (s.TenantId.Value, to.ToLowerInvariant());
            if (recentlyReminded.Contains(key)) { s.MarkRecoveryEmailed(); continue; }

            var reminded = false;
            var unsubscribed = suppressed.Contains(key);
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
                    && await email.SendAsync(s.TenantId.Value, to, rendered.Subject,
                        rendered.Html + UnsubscribeToken.Footer(dp, links.ApiBase, s.TenantId.Value, to), ct, Template))
                {
                    sent++;
                    reminded = true;
                }
            }
            // WhatsApp solo si la sesión llegó a cargar teléfono, la tienda tiene
            // la plantilla de carrito abandonado activada y el comprador tildó el
            // aviso por WhatsApp junto al teléfono, sin darse de baja de las
            // novedades de la tienda después (la misma lista de supresión que el
            // email). Meta lo cuenta como marketing y exige que la persona haya
            // aceptado.
            if (s.AcceptsWhatsApp && !unsubscribed)
            {
                await sp.GetRequiredService<WhatsAppNotifier>().NotifyAbandonedCartAsync(
                    s.TenantId.Value, s.Phone, s.BuyerName ?? "cliente", t.Name, ct);
                reminded = true;
            }
            if (reminded) recentlyReminded.Add(key);
            s.MarkRecoveryEmailed(reminded);
        }

        try
        {
            await checkoutDb.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            // Alguna compra cambió en el medio (el comprador volvió, o venció):
            // los recordatorios ya salieron, así que se vuelven a marcar sobre
            // lo que hay ahora en la base. Sin esto, la pasada siguiente los
            // mandaba de nuevo a todo el lote.
            var marked = candidates
                .Where(s => s.RecoveryEmailSentAtUtc is not null)
                .Select(s => (Session: s, Reminded: s.RecoveryReminderSentAtUtc is not null))
                .ToList();
            foreach (var (s, reminded) in marked)
            {
                tenantScope.Set(s.TenantId);
                await checkoutDb.Entry(s).ReloadAsync(ct);
                s.MarkRecoveryEmailed(reminded);
            }
            await checkoutDb.SaveChangesAsync(ct);
        }
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
