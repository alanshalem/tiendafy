using Api.Workers;
using Catalog.Infrastructure.Persistence;
using Customers.Infrastructure;
using Inventory.Core.Domain;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Notifications.Infrastructure;
using SharedKernel.Common;

namespace Api.Notifications;

/// <summary>
/// Avisos de favoritos: le escribe al comprador cuando algo que marcó con el
/// corazón baja de precio o vuelve a tener stock.
///
/// El favorito es la señal de intención de compra más fuerte que tiene una
/// tienda, y durante mucho tiempo no hizo nada: el corazón quedaba guardado en
/// la base y nadie se enteraba. Los dos avisos son opt-in por tienda (como
/// todos los emails automáticos), respetan la lista de bajas y llevan el link
/// para darse de baja.
///
/// Cada favorito recuerda lo último que vio (precio y si estaba agotado): la
/// primera pasada solo mira y anota, sin escribirle a nadie.
/// </summary>
public sealed class FavoriteAlertWorker(
    IServiceScopeFactory scopeFactory,
    ILogger<FavoriteAlertWorker> logger) : PollingWorker(TimeSpan.FromMinutes(30))
{
    protected override void LogPollFailure(Exception ex) =>
        logger.LogError(ex, "Avisos de favoritos fallaron.");

    protected override async Task PollOnceAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var sp = scope.ServiceProvider;
        var customersDb = sp.GetRequiredService<CustomersDbContext>();

        var tenantIds = await customersDb.CustomerFavorites.IgnoreQueryFilters()
            .Select(f => f.TenantId)
            .Distinct()
            .ToListAsync(ct);

        var tenant = sp.GetRequiredService<Api.Middleware.TenantContextHolder>();
        foreach (var tenantId in tenantIds)
        {
            // Cada tienda con su tienda fijada en el scope (plantillas, bajas,
            // stock): sin ella, los filtros no devuelven nada.
            tenant.Set(TenantId.From(tenantId));
            try { await RunTenantAsync(sp, customersDb, tenantId, ct); }
            catch (Exception ex)
            {
                logger.LogError(ex, "Avisos de favoritos fallaron para el tenant {TenantId}.", tenantId);
            }
        }
    }

    private async Task RunTenantAsync(
        IServiceProvider sp, CustomersDbContext customersDb, Guid tenantId, CancellationToken ct)
    {
        var favorites = await customersDb.CustomerFavorites.IgnoreQueryFilters()
            .Where(f => f.TenantId == tenantId)
            .ToListAsync(ct);
        if (favorites.Count == 0) return;

        var snapshots = await ProductSnapshotsAsync(sp, tenantId, favorites, ct);
        if (snapshots.Count == 0) return;

        // Emails de los dueños de esos favoritos.
        var customerIds = favorites.Select(f => f.CustomerId).Distinct().ToList();
        var people = (await customersDb.Customers.IgnoreQueryFilters()
                .Where(c => c.TenantId == tenantId && customerIds.Contains(c.Id) && c.Email != null)
                .Select(c => new { c.Id, c.Email, c.Name })
                .ToListAsync(ct))
            .ToDictionary(c => c.Id, c => (Email: c.Email!, c.Name));

        var suppressed = (await sp.GetRequiredService<NotificationsDbContext>().EmailSuppressions
                .AsNoTracking()
                .Where(s => s.TenantId == tenantId)
                .Select(s => s.Email)
                .ToListAsync(ct))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var store = await sp.GetRequiredService<StoreLinks>().ForTenantAsync(tenantId, "https", ct);
        if (store is null) return;

        var templates = sp.GetRequiredService<IEmailTemplates>();
        var sender = sp.GetRequiredService<BrandedEmailSender>();
        var dp = sp.GetRequiredService<IDataProtectionProvider>();
        var apiBase = sp.GetRequiredService<StoreLinks>().ApiBase;
        var now = DateTime.UtcNow;
        var sent = 0;

        foreach (var favorite in favorites)
        {
            if (!snapshots.TryGetValue(favorite.ProductId, out var product)) continue;

            var alert = favorite.ShouldAlertPriceDrop(product.PriceMinor, now) ? "favorito-baja-precio"
                : favorite.ShouldAlertBackInStock(product.Available > 0, now) ? "favorito-repuesto"
                : null;

            if (alert is not null
                && people.TryGetValue(favorite.CustomerId, out var person)
                && !suppressed.Contains(person.Email))
            {
                var vars = new Dictionary<string, string>
                {
                    ["store"] = store.Name,
                    ["name"] = person.Name,
                    ["product"] = product.Name,
                    ["price"] = MoneyFormat.ForNotification(new Money(product.PriceMinor, product.Currency)),
                    ["link"] = $"{store.Url}/productos/{product.Slug}",
                };

                var rendered = await templates.RenderAsync(tenantId, alert, vars, ct);
                if (rendered is { Enabled: true })
                {
                    await sender.SendAsync(tenantId, person.Email, rendered.Subject,
                        rendered.Html + UnsubscribeToken.Footer(dp, apiBase, tenantId, person.Email), ct, alert);
                    favorite.MarkAlerted(now);
                    sent++;
                }
            }

            // Se anota lo que se ve ahora, se haya avisado o no: así la próxima
            // baja se compara contra el precio de hoy y no contra el de siempre.
            favorite.Watch(product.PriceMinor, product.Available <= 0);
        }

        await customersDb.SaveChangesAsync(ct);
        if (sent > 0) logger.LogInformation("Favoritos: {Sent} avisos enviados (tenant {TenantId}).", sent, tenantId);
    }

    /// <summary>Precio "desde", stock total y datos de link de cada producto favorito.</summary>
    private static async Task<Dictionary<Guid, ProductSnapshot>> ProductSnapshotsAsync(
        IServiceProvider sp, Guid tenantId, List<CustomerFavorite> favorites, CancellationToken ct)
    {
        var productIds = favorites.Select(f => f.ProductId).Distinct().ToList();
        var products = await sp.GetRequiredService<CatalogDbContext>().Products.IgnoreQueryFilters()
            .AsNoTracking()
            .Where(p => p.TenantId == TenantId.From(tenantId) && productIds.Contains(p.Id))
            .ToListAsync(ct);
        if (products.Count == 0) return [];

        var variantIds = products.SelectMany(p => p.Variants.Select(v => v.Id)).ToList();
        var stock = await sp.GetRequiredService<IStockRepository>()
            .GetByVariantsAsync(TenantId.From(tenantId), variantIds, ct);
        var sellable = StockItem.SellableByVariant(variantIds, stock);

        return products.ToDictionary(
            p => p.Id,
            p => new ProductSnapshot(
                p.Name,
                p.Slug.Value,
                // El precio del producto es el "desde": es el que se muestra en
                // el listado y el que el comprador tiene en la cabeza.
                p.Variants.Min(v => v.Price.AmountInMinorUnits),
                p.Variants[0].Price.Currency,
                // Sin límite cuenta como disponible: nunca está agotado.
                StockItem.Total(p.Variants.Select(v => sellable[v.Id])) ?? int.MaxValue));
    }

    private sealed record ProductSnapshot(
        string Name, string Slug, long PriceMinor, string Currency, int Available);
}
