using Api.Workers;
using Checkout.Core.Domain;
using Checkout.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;
using Orders.Infrastructure.Persistence;
using Tenancy.Infrastructure.Persistence;

namespace Api.Notifications;

/// <summary>
/// Recuperación de carritos abandonados: cada cierto tiempo busca checkouts con
/// email, no pagados, abandonados hace un rato, y manda UN email con link a la
/// tienda. Marca el envío para no repetir.
/// </summary>
public sealed class AbandonedCartWorker(
    IServiceScopeFactory scopeFactory,
    IConfiguration configuration,
    ILogger<AbandonedCartWorker> logger) : PollingWorker(TimeSpan.FromMinutes(15))
{
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
            .Where(o => o.Status == OrderStatus.Paid && ids.Contains(o.CheckoutSessionId))
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
        var platform = (configuration["Tenancy:PlatformBaseDomain"] ?? "localhost").ToLowerInvariant();

        var sent = 0;
        foreach (var s in candidates)
        {
            if (paid.Contains(s.Id)) { s.MarkRecoveryEmailed(); continue; } // ya compró: no perseguir
            if (!byTenant.TryGetValue(s.TenantId.Value, out var t)) continue;

            var storeUrl = StoreUrls.For(t.CustomDomain, t.Subdomain, platform, "https");

            await email.SendAsync(s.TenantId.Value, s.Email!, $"¿Te quedó algo en el carrito de {t.Name}?",
                Body(t.Name, storeUrl, s.Items.Count), ct);
            // WhatsApp solo si la sesión llegó a cargar teléfono (paso Entrega)
            // y la tienda tiene la plantilla de carrito abandonado activada.
            await sp.GetRequiredService<WhatsAppNotifier>().NotifyAbandonedCartAsync(
                s.TenantId.Value, s.Phone, s.BuyerName ?? "cliente", t.Name, ct);
            s.MarkRecoveryEmailed();
            sent++;
        }

        await checkoutDb.SaveChangesAsync(ct);
        if (sent > 0) logger.LogInformation("Recuperación de carritos: {Sent} emails enviados.", sent);
    }

    private static string Body(string store, string url, int items) => $"""
        <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="margin:0 0 8px">Te esperan {items} producto(s)</h2>
          <p style="color:#444;line-height:1.5">Dejaste cosas en tu carrito de {store}. Todavía estás a tiempo de completar tu compra.</p>
          <p style="margin:24px 0">
            <a href="{url}" style="background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block">Volver a la tienda</a>
          </p>
        </div>
        """;
}
