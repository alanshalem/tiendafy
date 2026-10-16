using Api.Workers;
using Checkout.Core.Domain;
using Checkout.Infrastructure.Persistence;
using Inventory.Core.Domain;
using Inventory.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Orders.Infrastructure.Persistence;

namespace Api.Orders;

/// <summary>
/// Cierra los checkouts cuyo plazo pasó. El job de Inventario libera las
/// reservas vencidas, pero no puede tocar la sesión (es de otro módulo), y la
/// sesión quedaba "abierta" o "enviada" para siempre: el estado Expired no se
/// escribía nunca. Toca Checkout, Inventario y Órdenes, así que vive en la Api.
///
/// <para>
/// Por sesión con el plazo cumplido:
/// <list type="bullet">
/// <item>Abierta (nunca reservó): vencida.</item>
/// <item>Enviada con alguna reserva todavía activa (una transferencia con
/// horas para pagar): se deja; vuelve a mirarse en la próxima pasada.</item>
/// <item>Enviada que terminó en una venta cobrada: completada.</item>
/// <item>Enviada sin reservas activas ni venta cobrada: vencida.</item>
/// </list>
/// Así cada sesión llega a un estado final y el barrido no vuelve a mirar
/// siempre las mismas.
/// </para>
/// </summary>
public sealed class ExpiredCheckoutWorker(
    IServiceScopeFactory scopeFactory,
    ILogger<ExpiredCheckoutWorker> logger) : PollingWorker(TimeSpan.FromMinutes(1))
{
    private const int PageSize = 200;

    /// <summary>Tope de páginas por pasada: lo que no entra queda para la próxima.</summary>
    private const int MaxPages = 25;

    protected override void LogPollFailure(Exception ex) =>
        logger.LogError(ex, "El vencimiento de checkouts falló.");

    protected override async Task PollOnceAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var sp = scope.ServiceProvider;
        var checkoutDb = sp.GetRequiredService<CheckoutDbContext>();
        var inventoryDb = sp.GetRequiredService<InventoryDbContext>();
        var ordersDb = sp.GetRequiredService<OrdersDbContext>();

        var now = DateTime.UtcNow;
        var expired = 0;
        var completed = 0;
        // Las que se dejan (con reservas activas) siguen siendo candidatas y
        // quedan adelante en el orden: se saltean para llegar a las demás.
        var kept = 0;

        for (var page = 0; page < MaxPages; page++)
        {
            var sessions = await checkoutDb.Sessions
                .Where(s => (s.Status == CheckoutStatus.Open || s.Status == CheckoutStatus.Submitted)
                    && s.ExpiresAtUtc <= now)
                .OrderBy(s => s.ExpiresAtUtc).ThenBy(s => s.Id)
                .Skip(kept)
                .Take(PageSize)
                .ToListAsync(ct);
            if (sessions.Count == 0) break;

            var submitted = sessions.Where(s => s.Status == CheckoutStatus.Submitted).ToList();
            var reservationIds = submitted
                .SelectMany(s => s.Items)
                .Where(i => i.ReservationId is not null)
                .Select(i => i.ReservationId!.Value)
                .ToList();
            var active = reservationIds.Count == 0
                ? []
                : (await inventoryDb.Reservations.AsNoTracking()
                    .Where(r => reservationIds.Contains(r.Id) && r.Status == ReservationStatus.Active)
                    .Select(r => r.Id)
                    .ToListAsync(ct)).ToHashSet();

            var sessionIds = submitted.Select(s => s.Id).ToList();
            var paid = sessionIds.Count == 0
                ? []
                : (await ordersDb.Orders.AsNoTracking()
                    .Where(o => sessionIds.Contains(o.CheckoutSessionId) && o.PaidAtUtc != null)
                    .Select(o => o.CheckoutSessionId)
                    .ToListAsync(ct)).ToHashSet();

            foreach (var session in sessions)
            {
                if (session.Items.Any(i => i.ReservationId is { } id && active.Contains(id)))
                {
                    kept++;
                    continue;
                }

                if (paid.Contains(session.Id))
                {
                    if (session.Complete().IsSuccess) completed++;
                }
                else if (session.Expire(now).IsSuccess)
                {
                    expired++;
                }
            }

            await checkoutDb.SaveChangesAsync(ct);
            if (sessions.Count < PageSize) break;
        }

        if (expired + completed > 0)
            logger.LogInformation(
                "Checkouts cerrados: {Expired} vencidos, {Completed} completados.", expired, completed);
    }
}
