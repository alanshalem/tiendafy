using Api.Notifications;
using Checkout.Core.Domain;
using Checkout.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Orders.Infrastructure.Persistence;
using SharedKernel.Common;

namespace Api.Stats;

/// <summary>
/// Los carritos abandonados de <c>/stats/abandoned-carts</c> y del asistente:
/// checkouts no completados que no terminaron en una compra, uno por comprador
/// (el criterio de <see cref="AbandonedCarts"/>, el mismo del recordatorio).
/// Movida tal cual desde el endpoint; filtra por tienda explícita además del
/// filtro global de EF.
/// </summary>
public sealed class AbandonedCartsQuery(CheckoutDbContext checkout, OrdersDbContext orders)
{
    /// <summary>
    /// Sesiones no completadas y clasificadas como abandonadas, las más nuevas
    /// primero. <paramref name="untilUtc"/> es opcional: sin tope superior.
    /// </summary>
    public async Task<IReadOnlyList<CheckoutSession>> PendingAsync(
        TenantId tenant, DateTime sinceUtc, DateTime? untilUtc, CancellationToken ct)
    {
        var tid = tenant;

        var query = checkout.Sessions
            .Where(s => s.TenantId == tid && s.CreatedAtUtc >= sinceUtc && s.Status != CheckoutStatus.Completed);
        if (untilUtc is { } until) query = query.Where(s => s.CreatedAtUtc < until);
        var sessions = await query.ToListAsync(ct);

        var outcomes = await AbandonedCarts.ClassifyAsync(sessions, checkout, orders, ct);
        return sessions
            .Where(s => outcomes[s.Id] == AbandonedCarts.Outcome.Abandoned)
            .OrderByDescending(s => s.CreatedAtUtc)
            .ToList();
    }
}
