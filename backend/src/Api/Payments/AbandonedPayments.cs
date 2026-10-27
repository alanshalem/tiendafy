using Api.Orders;
using Api.Workers;
using Inventory.Contracts;
using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;
using Orders.Core.Features;
using Orders.Infrastructure.Persistence;
using Payments.Contracts;
using Payments.Core.Domain;
using Payments.Infrastructure.Persistence;
using SharedKernel.Common;

namespace Api.Payments;

/// <summary>
/// Cancela las ventas de la tienda online que se iban a pagar con una pasarela
/// (Mercado Pago o Payway) y nunca se pagaron: el comprador abrió Checkout Pro
/// y se fue, abandonó el Brick, o el cobro de Payway quedó en el medio y la
/// reconsulta se dio por vencida. Sin esto quedaban pendientes para siempre:
/// solo las de transferencia o efectivo tenían plazo (OfflinePaymentService),
/// y la reserva de stock vence sola a la media hora pero la venta no.
///
/// Antes de cancelar se mira si hay un pago en curso, para no cancelar algo
/// que se está por cobrar:
/// <list type="bullet">
/// <item>Mercado Pago: se buscan los pagos de la orden por
/// <c>external_reference</c>. Uno aprobado que no llegó por webhook se aplica
/// (la venta queda pagada); uno pendiente o en proceso (un cupón de Rapipago o
/// Pago Fácil sin pagar, una tarjeta en revisión, un desafío 3DS) la deja
/// esperando. Si no hay ninguno vivo, se vence el link (para que nadie pague
/// una venta cancelada) y se cancela.</item>
/// <item>Payway: mientras la reconsulta siga preguntando
/// (<see cref="PaywayPaymentAttempt.RecheckMaxAge"/>), se espera.</item>
/// </list>
///
/// Cada venta se reclama con un UPDATE condicional (sigue pendiente →
/// cancelada), como las transferencias vencidas: el webhook que la paga en el
/// mismo segundo choca (xmin) y se reintenta, y entonces aplica el pago tardío
/// sobre la cancelada (queda pagada y para revisar, ver SettlePaymentHandler).
/// Al comprador no se le manda nada: nunca confirmó el pago.
/// </summary>
public sealed class AbandonedPaymentService(
    OrdersDbContext ordersDb,
    PaymentsDbContext paymentsDb,
    IMercadoPagoPaymentService mercadoPago,
    IInventoryService inventory,
    SettlePaymentHandler settle,
    PaidOrderSideEffects paidEffects,
    OrderCouponUses couponUses,
    ILogger<AbandonedPaymentService> logger)
{
    /// <summary>
    /// Desde cuándo una venta de pasarela sin pagar se da por abandonada. Un
    /// día: la reserva de stock ya venció hace rato y los pagos que tardan (el
    /// efectivo, una revisión, el 3DS) se detectan por la consulta a la
    /// pasarela, no por el plazo.
    /// </summary>
    public static readonly TimeSpan AbandonAfter = TimeSpan.FromHours(24);

    /// <summary>
    /// Si la pasarela no contesta (caída, la tienda desconectó la cuenta), se
    /// reintenta en la próxima pasada; pasado este tiempo, se cancela igual. Un
    /// pago que entre después la deja pagada y para revisar.
    /// </summary>
    public static readonly TimeSpan GiveUpCheckingAfter = TimeSpan.FromDays(7);

    /// <summary>El motivo que ve el comercio en el detalle de la venta.</summary>
    public const string Reason = "No se completó el pago";

    /// <summary>Ventas que se miran por pasada (una consulta a la pasarela por cada una).</summary>
    public const int BatchSize = 100;

    /// <summary>Estados de un pago de Mercado Pago que todavía se pueden aprobar.</summary>
    private static readonly HashSet<string> LivePaymentStatuses =
        new(StringComparer.OrdinalIgnoreCase) { "pending", "in_process", "authorized" };

    private enum Decision { Wait, Cancel, Paid }

    /// <summary>Mira las ventas de pasarela viejas sin pagar, de todas las tiendas. Devuelve cuántas canceló.</summary>
    public async Task<int> ExpireAbandonedAsync(DateTime nowUtc, CancellationToken ct)
    {
        var cutoff = nowUtc - AbandonAfter;
        // Solo las del checkout de la tienda: un link de pago de una venta
        // manual o de un presupuesto lo mandó el comercio y lo cancela él.
        var candidates = await ordersDb.Orders.AsNoTracking()
            .Where(o => o.Status == OrderStatus.PendingPayment
                && o.Channel == Order.ChannelWeb
                && o.PaymentDueAtUtc == null
                && !Order.OfflineProviders.Contains(o.PaymentProvider)
                && o.CreatedAtUtc <= cutoff)
            .OrderBy(o => o.CreatedAtUtc)
            .Select(o => new Candidate(o.Id, o.TenantId, o.CreatedAtUtc, o.PreferenceId))
            .Take(BatchSize)
            .ToListAsync(ct);

        var cancelled = 0;
        foreach (var order in candidates)
        {
            try
            {
                var decision = await DecideAsync(order, nowUtc, ct);
                if (decision == Decision.Cancel && await CancelAsync(order, nowUtc, ct))
                    cancelled++;
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                // Que una falle no frena a las demás: se vuelve a mirar en la próxima pasada.
                logger.LogError(ex, "No se pudo resolver la venta abandonada {OrderId}.", order.Id);
            }
        }
        return cancelled;
    }

    private sealed record Candidate(Guid Id, TenantId TenantId, DateTime CreatedAtUtc, string? PreferenceId);

    private async Task<Decision> DecideAsync(Candidate order, DateTime nowUtc, CancellationToken ct)
    {
        var attempts = await paymentsDb.PaywayPaymentAttempts.AsNoTracking()
            .Where(a => a.OrderId == order.Id)
            .ToListAsync(ct);
        return attempts.Count > 0
            ? await DecidePaywayAsync(order, attempts, nowUtc, ct)
            : await DecideMercadoPagoAsync(order, nowUtc, ct);
    }

    private async Task<Decision> DecidePaywayAsync(
        Candidate order, List<PaywayPaymentAttempt> attempts, DateTime nowUtc, CancellationToken ct)
    {
        // Un cobro aprobado que no llegó a la venta (se cayó el proceso entre
        // el cobro y el guardado): se aplica como en el momento.
        if (attempts.FirstOrDefault(a => a.Status == PaywayPaymentStatus.Approved && a.ProviderPaymentId is not null) is { } approved)
        {
            await SettleApprovedAsync(order, approved.ProviderPaymentId!, null, null, ct);
            return Decision.Paid;
        }

        // La reconsulta todavía pregunta por ese cobro: Payway lo puede resolver.
        var oldest = nowUtc - PaywayPaymentAttempt.RecheckMaxAge;
        return attempts.Any(a => a.NeedsRecheck && a.CreatedAtUtc > oldest)
            ? Decision.Wait
            : Decision.Cancel;
    }

    private async Task<Decision> DecideMercadoPagoAsync(Candidate order, DateTime nowUtc, CancellationToken ct)
    {
        var payments = await mercadoPago.SearchPaymentsAsync(order.TenantId, order.Id, ct);
        if (payments.IsFailure)
        {
            if (order.CreatedAtUtc <= nowUtc - GiveUpCheckingAfter)
            {
                logger.LogWarning("No se pudieron consultar los pagos de la venta {OrderId} ({Error}) y lleva más de {Days} días sin pagarse: se cancela.",
                    order.Id, payments.Error.Code, GiveUpCheckingAfter.TotalDays);
                await ExpireLinkAsync(order, ct);
                return Decision.Cancel;
            }
            logger.LogInformation("No se pudieron consultar los pagos de la venta {OrderId} ({Error}); se reintenta después.",
                order.Id, payments.Error.Code);
            return Decision.Wait;
        }

        // Solo los de esta orden (la búsqueda filtra, pero no se confía a ciegas).
        var mine = payments.Value
            .Where(p => string.Equals(p.ExternalReference, order.Id.ToString(), StringComparison.OrdinalIgnoreCase))
            .ToList();

        if (mine.FirstOrDefault(p => string.Equals(p.Status, "approved", StringComparison.OrdinalIgnoreCase)) is { } approved)
        {
            await SettleApprovedAsync(order, approved.PaymentId, approved.TransactionAmountRefunded, approved.FeeAmount, ct);
            return Decision.Paid;
        }

        if (mine.Any(p => LivePaymentStatuses.Contains(p.Status)))
            return Decision.Wait;

        await ExpireLinkAsync(order, ct);
        return Decision.Cancel;
    }

    /// <summary>
    /// Vence el link de Checkout Pro antes de cancelar, para que nadie pague
    /// una venta cancelada. Si Mercado Pago no lo vence, se cancela igual: un
    /// pago que entre después la deja pagada y para revisar.
    /// </summary>
    private async Task ExpireLinkAsync(Candidate order, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(order.PreferenceId)) return;
        var expired = await mercadoPago.ExpirePreferenceAsync(order.TenantId, order.PreferenceId, ct);
        if (expired.IsFailure)
            logger.LogWarning("No se pudo vencer el link {PreferenceId} de la venta abandonada {OrderId} ({Error}).",
                order.PreferenceId, order.Id, expired.Error.Code);
    }

    private async Task SettleApprovedAsync(
        Candidate order, string paymentId, decimal? refunded, decimal? fee, CancellationToken ct)
    {
        var settled = await settle.HandleAsync(order.Id, "approved", paymentId, refunded, fee, ct);
        await paidEffects.RunIfJustPaidAsync(settled, ct);
        logger.LogWarning("La venta {OrderId} tenía el pago aprobado {PaymentId} sin aplicar (no llegó el aviso): quedó pagada.",
            order.Id, paymentId);
    }

    /// <summary>La reclama (sigue pendiente → cancelada) y devuelve el stock. False si otro llegó primero.</summary>
    private async Task<bool> CancelAsync(Candidate order, DateTime nowUtc, CancellationToken ct)
    {
        var claimed = await ordersDb.Orders
            .Where(o => o.Id == order.Id && o.Status == OrderStatus.PendingPayment)
            .ExecuteUpdateAsync(s => s
                .SetProperty(o => o.Status, OrderStatus.Cancelled)
                .SetProperty(o => o.CancelledAtUtc, nowUtc)
                .SetProperty(o => o.CancelledBy, "sistema")
                .SetProperty(o => o.CancelReason, Reason), ct);
        if (claimed != 1) return false;

        var cancelled = await ordersDb.Orders.AsNoTracking().FirstAsync(o => o.Id == order.Id, ct);
        foreach (var reservationId in cancelled.ReservationIds)
        {
            // Casi siempre ya la liberó el job de vencidas: no hay nada que devolver.
            await inventory.ReleaseReservationAsync(order.TenantId.Value, reservationId, ct);
        }
        await couponUses.ReleaseAsync(cancelled, ct);

        logger.LogInformation("Venta {OrderId} cancelada: no se completó el pago en {Hours} horas.", order.Id, AbandonAfter.TotalHours);
        return true;
    }
}

/// <summary>Cancela cada 10 minutos las ventas de pasarela abandonadas (ver <see cref="AbandonedPaymentService"/>).</summary>
public sealed class AbandonedPaymentWorker(
    IServiceScopeFactory scopeFactory,
    ILogger<AbandonedPaymentWorker> logger) : PollingWorker(TimeSpan.FromMinutes(10))
{
    protected override void LogPollFailure(Exception ex) =>
        logger.LogError(ex, "El vencimiento de ventas con pago abandonado falló.");

    protected override async Task PollOnceAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var service = scope.ServiceProvider.GetRequiredService<AbandonedPaymentService>();
        await service.ExpireAbandonedAsync(DateTime.UtcNow, ct);
    }
}
