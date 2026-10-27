using Api.Workers;
using MercadoLibre.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Api.Meli;

/// <summary>
/// Procesa el inbox de webhooks de Mercado Libre (el endpoint solo persiste y
/// responde 200 enseguida, dentro de los 20 s que da ML). Resuelve el tenant por el
/// user_id del vendedor y re-consulta el resource con SU token — jamás se
/// confía en el payload del webhook.
/// </summary>
public sealed class MeliNotificationWorker(
    IServiceScopeFactory scopeFactory, ILogger<MeliNotificationWorker> logger) : PollingWorker(TimeSpan.FromSeconds(5))
{
    protected override void LogPollFailure(Exception ex) =>
        logger.LogError(ex, "Polling de notificaciones de Mercado Libre falló.");

    protected override async Task PollOnceAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var sp = scope.ServiceProvider;
        var db = sp.GetRequiredService<MeliDbContext>();

        await InboxDrain.DrainAsync(db, db.Notifications,
            n => ProcessAsync(sp, db, n, ct),
            (ex, n) => logger.LogError(ex, "Notificación ML {Id} ({Topic}) falló, intento {Attempt}.",
                n.Id, n.Topic, n.Attempts + 1),
            ct);
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

        // La venta es de la tienda de esa conexión: se fija en el scope del
        // worker, que no tiene una (sin ella, los filtros no devuelven nada).
        sp.GetRequiredService<Api.Middleware.TenantContextHolder>().Set(SharedKernel.Common.TenantId.From(connection.TenantId));
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
