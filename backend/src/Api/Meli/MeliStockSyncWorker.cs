using Inventory.Core.Domain;
using MercadoLibre.Infrastructure;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Common;

namespace Api.Meli;

/// <summary>
/// Empuja el stock local a Mercado Libre para las publicaciones vinculadas
/// (Tiendafy → ML; la otra dirección la hace MeliSyncService al procesar
/// ventas). Reconciliación por diferencia: solo PUTea cuando el disponible
/// local difiere del último valor empujado — cero requests redundantes.
/// </summary>
public sealed class MeliStockSyncWorker(
    IServiceScopeFactory scopeFactory, ILogger<MeliStockSyncWorker> logger) : BackgroundService
{
    private static readonly TimeSpan PollInterval = TimeSpan.FromMinutes(5);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try { await SyncOnceAsync(stoppingToken); }
            catch (Exception ex) { logger.LogError(ex, "Sync de stock a Mercado Libre falló."); }
            try { await Task.Delay(PollInterval, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }

    private async Task SyncOnceAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var sp = scope.ServiceProvider;
        var db = sp.GetRequiredService<MeliDbContext>();

        var connections = await db.Connections.IgnoreQueryFilters().AsNoTracking()
            .Where(c => c.StockSyncEnabled)
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
        var links = await db.ItemLinks.IgnoreQueryFilters()
            .Where(l => l.TenantId == connection.TenantId && l.SyncStock)
            .ToListAsync(ct);
        if (links.Count == 0) return;

        var stock = sp.GetRequiredService<IStockRepository>();
        var items = await stock.GetByVariantsAsync(
            TenantId.From(connection.TenantId), links.Select(l => l.VariantId).ToList(), ct);
        var availableByVariant = items.ToDictionary(s => s.VariantId, s => s.Available);

        var tokens = sp.GetRequiredService<MeliTokenService>();
        string? token = null;

        foreach (var link in links)
        {
            var available = availableByVariant.GetValueOrDefault(link.VariantId, 0);
            if (link.LastPushedQty == available) continue;

            token ??= await tokens.GetValidTokenAsync(connection.TenantId, ct);
            if (token is null) return;

            var client = sp.GetRequiredService<MeliClient>();
            object payload = link.MeliVariationId is { } variationId
                ? new { variations = new[] { new { id = variationId, available_quantity = available } } }
                : new { available_quantity = available };

            try
            {
                using var _ = await client.PutAsync(token, $"/items/{link.MeliItemId}", payload, ct);
                link.MarkPushed(available);
                logger.LogInformation(
                    "Stock empujado a ML: {ItemId} (variación {VariationId}) → {Qty} (tenant {TenantId}).",
                    link.MeliItemId, link.MeliVariationId, available, connection.TenantId);
            }
            catch (MeliException ex)
            {
                // Publicación pausada/cerrada o rate limit: se reintenta en el
                // próximo ciclo (LastPushedQty queda desactualizado a propósito).
                logger.LogWarning("PUT de stock a {ItemId} falló: {Message}", link.MeliItemId, ex.Message);
            }
        }

        await db.SaveChangesAsync(ct);
    }
}
