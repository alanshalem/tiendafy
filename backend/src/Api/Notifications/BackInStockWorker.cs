using System.Net;
using Api.Endpoints;
using Api.Workers;
using Catalog.Contracts;
using Customers.Infrastructure;
using Inventory.Core.Domain;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Notifications.Infrastructure;
using SharedKernel.Common;

namespace Api.Notifications;

/// <summary>
/// "Avisame cuando ingrese": cuando una variante agotada vuelve a tener
/// stock, le escribe a cada persona que lo pidió. Una vez por suscripción.
///
/// <para>
/// <b>Por qué polling y no un evento de Inventory.</b> El stock cambia por
/// muchos caminos —ajuste a mano, recepción de una compra, reserva vencida,
/// venta cancelada, Mercado Libre, kits— y todos van por SQL atómico en el
/// repositorio, sin bus de eventos. Engancharse en cada uno es fácil de
/// olvidar en el próximo; mirar el stock de lo que alguien espera los cubre a
/// todos. La suscripción solo se acepta con la variante en 0, así que "hay
/// stock y está pendiente" ES el paso de 0 a más.
/// </para>
///
/// <para>
/// Límites: un tope por pasada y por persona (si vuelven veinte talles a la
/// vez, no le llegan veinte emails juntos: el resto sale en la pasada
/// siguiente), respeta la lista de bajas, y cada email trae su link para
/// dejar de esperar.
/// </para>
/// </summary>
public sealed class BackInStockWorker(
    IServiceScopeFactory scopeFactory,
    ILogger<BackInStockWorker> logger) : PollingWorker(TimeSpan.FromMinutes(5))
{
    public const string Template = "aviso-stock";

    private const int MaxPerPass = 500;
    private const int MaxPerEmailPerPass = 3;

    protected override void LogPollFailure(Exception ex) =>
        logger.LogError(ex, "Avisos de reposición fallaron.");

    protected override async Task PollOnceAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var sp = scope.ServiceProvider;
        var db = sp.GetRequiredService<CustomersDbContext>();

        var tenantIds = await db.StockAlerts.IgnoreQueryFilters()
            .Where(s => s.NotifiedAtUtc == null && s.CancelledAtUtc == null)
            .Select(s => s.TenantId)
            .Distinct()
            .ToListAsync(ct);

        var budget = MaxPerPass;
        foreach (var tenantId in tenantIds)
        {
            if (budget <= 0) break;
            try { budget -= await RunTenantAsync(sp, db, tenantId, budget, ct); }
            catch (Exception ex)
            {
                logger.LogError(ex, "Avisos de reposición fallaron para el tenant {TenantId}.", tenantId);
            }
        }
    }

    private async Task<int> RunTenantAsync(
        IServiceProvider sp, CustomersDbContext db, Guid tenantId, int budget, CancellationToken ct)
    {
        var pending = await db.StockAlerts.IgnoreQueryFilters()
            .Where(s => s.TenantId == tenantId && s.NotifiedAtUtc == null && s.CancelledAtUtc == null)
            .OrderBy(s => s.CreatedAtUtc)
            .ToListAsync(ct);
        if (pending.Count == 0) return 0;

        var variantIds = pending.Select(s => s.VariantId).Distinct().ToList();
        var restocked = (await sp.GetRequiredService<IStockRepository>()
                .GetByVariantsAsync(TenantId.From(tenantId), variantIds, ct))
            .Where(s => s.Available > 0)
            .Select(s => s.VariantId)
            .ToHashSet();
        var ready = pending.Where(s => restocked.Contains(s.VariantId)).ToList();
        if (ready.Count == 0) return 0;

        var now = DateTime.UtcNow;
        var suppressed = (await sp.GetRequiredService<NotificationsDbContext>().EmailSuppressions
                .IgnoreQueryFilters().AsNoTracking()
                .Where(s => s.TenantId == tenantId)
                .Select(s => s.Email)
                .ToListAsync(ct))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var variants = (await sp.GetRequiredService<ICatalogCheckoutQuery>()
                .GetVariantsAsync(tenantId, [.. ready.Select(s => s.VariantId).Distinct()], ct))
            .ToDictionary(v => v.VariantId);
        var slugs = await ProductSlugsAsync(sp, tenantId, [.. ready.Select(s => s.ProductId).Distinct()], ct);
        var links = sp.GetRequiredService<StoreLinks>();
        var store = await links.ForTenantAsync(tenantId, "https", ct);
        if (store is null) return 0;

        var templates = sp.GetRequiredService<IEmailTemplates>();
        var sender = sp.GetRequiredService<BrandedEmailSender>();
        var dp = sp.GetRequiredService<IDataProtectionProvider>();
        var apiBase = links.ApiBase;
        var perEmail = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        var sent = 0;

        foreach (var sub in ready)
        {
            if (sent >= budget) break;

            // Lo que ya no se vende (borrado, despublicado) o quien se dio de
            // baja de los emails de la tienda: se cierra sin escribir.
            if (!variants.TryGetValue(sub.VariantId, out var variant) || !variant.ProductIsActive
                || suppressed.Contains(sub.Email))
            {
                sub.Cancel(now);
                continue;
            }
            if (perEmail.GetValueOrDefault(sub.Email) >= MaxPerEmailPerPass) continue;

            var label = string.IsNullOrWhiteSpace(variant.VariantDescription) || variant.VariantDescription == "Única"
                ? variant.ProductName
                : $"{variant.ProductName} ({variant.VariantDescription})";
            var link = slugs.TryGetValue(sub.ProductId, out var slug) ? $"{store.Url}/productos/{slug}" : store.Url;
            var vars = new Dictionary<string, string>
            {
                ["store"] = WebUtility.HtmlEncode(store.Name),
                ["product"] = WebUtility.HtmlEncode(label),
                ["price"] = WebUtility.HtmlEncode(new Money(variant.Price.Amount, variant.Price.Currency).ToString()),
                ["link"] = link,
            };

            var rendered = await templates.RenderAsync(tenantId, Template, vars, ct);
            // Apagado por la tienda: quedan pendientes; si lo vuelve a prender, salen.
            if (rendered is not { Enabled: true }) break;

            var unsubscribe = BackInStockUnsubscribeToken.Protect(dp, tenantId, sub.Email);
            var html = rendered.Html + $"<p style='color:#a1a1aa;font-size:12px;margin-top:24px'>Te escribimos porque pediste que te avisemos. " +
                $"<a href='{WebUtility.HtmlEncode($"{apiBase}/api/v1/back-in-stock/unsubscribe?token={Uri.EscapeDataString(unsubscribe)}")}' style='color:#a1a1aa'>No avisarme más</a>.</p>";

            await sender.SendAsync(tenantId, sub.Email, rendered.Subject, html, ct, Template);
            // Se marca y se guarda de a uno: si el proceso se corta a la mitad,
            // nadie recibe el mismo aviso dos veces.
            sub.MarkNotified(now);
            await db.SaveChangesAsync(ct);
            perEmail[sub.Email] = perEmail.GetValueOrDefault(sub.Email) + 1;
            sent++;
        }

        await db.SaveChangesAsync(ct);
        if (sent > 0) logger.LogInformation("Reposición: {Sent} avisos enviados (tenant {TenantId}).", sent, tenantId);
        return sent;
    }

    private static async Task<Dictionary<Guid, string>> ProductSlugsAsync(
        IServiceProvider sp, Guid tenantId, List<Guid> productIds, CancellationToken ct)
    {
        var products = await sp.GetRequiredService<Catalog.Infrastructure.Persistence.CatalogDbContext>().Products
            .IgnoreQueryFilters().AsNoTracking()
            .Where(p => p.TenantId == TenantId.From(tenantId) && productIds.Contains(p.Id))
            .ToListAsync(ct);
        return products.ToDictionary(p => p.Id, p => p.Slug.Value);
    }
}
