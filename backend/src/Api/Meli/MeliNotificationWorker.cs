using MercadoLibre.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Api.Meli;

/// <summary>
/// Procesa el inbox de webhooks de Mercado Libre (el endpoint solo persiste y
/// responde 200 dentro de los 500 ms que exige ML). Resuelve el tenant por el
/// user_id del vendedor y re-consulta el resource con SU token — jamás se
/// confía en el payload del webhook.
/// </summary>
public sealed class MeliNotificationWorker(
    IServiceScopeFactory scopeFactory, ILogger<MeliNotificationWorker> logger) : BackgroundService
{
    private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(5);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try { await PollOnceAsync(stoppingToken); }
            catch (Exception ex) { logger.LogError(ex, "Polling de notificaciones de Mercado Libre falló."); }
            try { await Task.Delay(PollInterval, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }

    private async Task PollOnceAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var sp = scope.ServiceProvider;
        var db = sp.GetRequiredService<MeliDbContext>();

        var pending = await db.Notifications
            .Where(n => n.Status == MeliNotification.StatusPending)
            .OrderBy(n => n.CreatedAtUtc)
            .Take(20)
            .ToListAsync(ct);

        foreach (var notification in pending)
        {
            try
            {
                await ProcessAsync(sp, db, notification, ct);
                notification.MarkDone();
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Notificación ML {Id} ({Topic}) falló, intento {Attempt}.",
                    notification.Id, notification.Topic, notification.Attempts + 1);
                notification.MarkFailed(ex.Message);
            }
            await db.SaveChangesAsync(ct);
        }
    }

    private async Task ProcessAsync(
        IServiceProvider sp, MeliDbContext db, MeliNotification notification, CancellationToken ct)
    {
        // Solo las ventas alimentan el cache; el resto (preguntas, mensajes,
        // reclamos) se proxya en vivo desde el panel y no necesita procesarse.
        if (notification.Topic != "orders_v2") return;

        var orderId = ParseOrderId(notification.Resource);
        if (orderId is null) return;

        var connection = await db.Connections.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(c => c.MeliUserId == notification.MeliUserId, ct);
        if (connection is null)
        {
            logger.LogWarning("Notificación ML de user {UserId} sin conexión asociada; ignorada.",
                notification.MeliUserId);
            return;
        }

        var sync = sp.GetRequiredService<MeliSyncService>();
        await sync.UpsertOrderAsync(connection.TenantId, orderId.Value, ct);
    }

    /// <summary>Extrae el id numérico de "/orders/123456" (resource del webhook).</summary>
    public static long? ParseOrderId(string resource)
    {
        var last = resource.TrimEnd('/').Split('/').LastOrDefault();
        return long.TryParse(last, out var id) ? id : null;
    }
}
