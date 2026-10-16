using Api.Workers;
using Inventory.Core.Domain;
using MercadoLibre.Infrastructure;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Common;

namespace Api.Meli;

/// <summary>
/// Empuja stock y precio locales a Mercado Libre para las publicaciones
/// vinculadas (Tiendafy → ML; la otra dirección la hace MeliSyncService al
/// procesar ventas). Reconciliación por diferencia: solo PUTea lo que cambió
/// respecto del último valor empujado — cero requests redundantes.
///
/// El precio importa tanto como el stock: sin esto, una repreciación por
/// inflación dejaba las publicaciones de ML vendiendo a precio de hace meses.
/// </summary>
public sealed class MeliStockSyncWorker(
    IServiceScopeFactory scopeFactory, ILogger<MeliStockSyncWorker> logger) : PollingWorker(TimeSpan.FromMinutes(5))
{
    protected override void LogPollFailure(Exception ex) =>
        logger.LogError(ex, "Sync de stock a Mercado Libre falló.");

    protected override async Task PollOnceAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var sp = scope.ServiceProvider;
        var db = sp.GetRequiredService<MeliDbContext>();

        var connections = await db.Connections.IgnoreQueryFilters().AsNoTracking()
            // Stock y precio son interruptores independientes: alcanza con uno
            // prendido para que la tienda entre en la pasada. Antes solo entraba
            // con el de stock, y "Sincronizar precios" solo no hacía nada: la
            // repreciación nunca llegaba a ML.
            // Una cuenta de ejemplo no tiene token real: empujarle stock termina
            // en 401 y en un reintento cada cinco minutos, para siempre.
            .Where(c => (c.StockSyncEnabled || c.PriceSyncEnabled) && !c.IsDemo)
            .ToListAsync(ct);

        foreach (var connection in connections)
        {
            try { await SyncTenantAsync(sp, db, connection, ct); }
            catch (Exception ex)
            {
                logger.LogError(ex, "Sync de stock ML falló para tenant {TenantId}.", connection.TenantId);
            }
        }
    }

    private async Task SyncTenantAsync(
        IServiceProvider sp, MeliDbContext db, MeliConnection connection, CancellationToken ct)
    {
        // Cada vínculo empuja solo lo que la tienda tiene prendido: el
        // interruptor de la conexión manda sobre el de la publicación (la
        // misma regla que decide si una venta de ML descuenta stock local:
        // MeliConnection.SyncsStockOf; la consulta la repite porque EF no la traduce).
        var syncStock = connection.StockSyncEnabled;
        var syncPrice = connection.PriceSyncEnabled;
        var links = await db.ItemLinks.IgnoreQueryFilters()
            .Where(l => l.TenantId == connection.TenantId
                && ((syncStock && l.SyncStock) || (syncPrice && l.SyncPrice)))
            .ToListAsync(ct);
        if (links.Count == 0) return;

        var tenant = TenantId.From(connection.TenantId);
        var stock = sp.GetRequiredService<IStockRepository>();
        var items = await stock.GetByVariantsAsync(tenant, links.Select(l => l.VariantId).ToList(), ct);
        var availableByVariant = items.ToDictionary(s => s.VariantId, s => s.Available);
        var priceByVariant = await LocalPricesAsync(sp, connection, links, ct);

        var tokens = sp.GetRequiredService<MeliTokenService>();
        string? token = null;

        foreach (var link in links)
        {
            // Colchón anti-oversell entre canales: ML se entera DESPUÉS de cada
            // venta, así que se publica stock − buffer para absorber la ventana.
            var available = Math.Max(
                0, availableByVariant.GetValueOrDefault(link.VariantId, 0) - connection.StockBufferUnits);
            var pushStock = connection.SyncsStockOf(link) && link.LastPushedQty != available;

            long? priceMinor = null;
            if (syncPrice && link.SyncPrice && priceByVariant.TryGetValue(link.VariantId, out var localMinor) && localMinor > 0)
            {
                var target = MeliPricing.ForChannel(localMinor, connection.PriceMarkupPct);
                if (link.LastPushedPriceMinor != target) priceMinor = target;
            }

            if (!pushStock && priceMinor is null) continue;

            token ??= await tokens.GetValidTokenAsync(connection.TenantId, ct);
            if (token is null) return;

            // Un solo PUT con lo que cambió. En publicaciones con variaciones,
            // stock y precio viven DENTRO de la variación (ML rechaza el precio
            // a nivel ítem cuando el ítem tiene variaciones).
            var fields = new Dictionary<string, object>();
            if (pushStock) fields["available_quantity"] = available;
            if (priceMinor is { } minor) fields["price"] = MeliPricing.ToApiAmount(minor);

            object payload;
            if (link.MeliVariationId is { } variationId)
            {
                var variation = new Dictionary<string, object> { ["id"] = variationId };
                foreach (var (key, value) in fields) variation[key] = value;
                payload = new { variations = new[] { variation } };
            }
            else
            {
                payload = fields;
            }

            var client = sp.GetRequiredService<MeliClient>();
            try
            {
                using var _ = await client.PutAsync(token, $"/items/{link.MeliItemId}", payload, ct);
                if (pushStock) link.MarkPushed(available);
                if (priceMinor is { } pushed) link.MarkPricePushed(pushed);
                logger.LogInformation(
                    "ML actualizado: {ItemId} (variación {VariationId}) → {Fields} (tenant {TenantId}).",
                    link.MeliItemId, link.MeliVariationId, string.Join(", ", fields.Keys), connection.TenantId);
            }
            catch (MeliException ex)
            {
                // Publicación pausada/cerrada o rate limit: se reintenta en el
                // próximo ciclo (los "último empujado" quedan desactualizados a
                // propósito, y esa diferencia es la que dispara el reintento).
                logger.LogWarning("PUT a {ItemId} falló: {Message}", link.MeliItemId, ex.Message);
            }
        }

        await db.SaveChangesAsync(ct);
    }

    /// <summary>
    /// Precio local (centavos) de cada variante vinculada. Se lee del catálogo
    /// una sola vez por tienda; sin sincronización de precios ni se consulta.
    /// </summary>
    private static async Task<Dictionary<Guid, long>> LocalPricesAsync(
        IServiceProvider sp, MeliConnection connection, List<MeliItemLink> links, CancellationToken ct)
    {
        if (!connection.PriceSyncEnabled || links.TrueForAll(l => !l.SyncPrice)) return [];

        var productIds = links.Select(l => l.ProductId).Distinct().ToList();
        var catalog = sp.GetRequiredService<Catalog.Infrastructure.Persistence.CatalogDbContext>();
        var products = await catalog.Products.IgnoreQueryFilters().AsNoTracking()
            .Where(p => p.TenantId == TenantId.From(connection.TenantId) && productIds.Contains(p.Id))
            .ToListAsync(ct);

        return products
            .SelectMany(p => p.Variants)
            .ToDictionary(v => v.Id, v => v.Price.AmountInMinorUnits);
    }
}
