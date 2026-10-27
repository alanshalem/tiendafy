using Api.Orders;
using Api.Workers;
using Microsoft.EntityFrameworkCore;
using Orders.Core.Features;
using Payments.Contracts;
using Payments.Core.Domain;
using Payments.Infrastructure.Persistence;
using SharedKernel.Common;

namespace Api.Payments;

/// <summary>
/// Vuelve a preguntarle a Payway por los cobros que quedaron en el medio.
///
/// Payway no manda webhooks para la API directa: un cobro que dio timeout
/// (<see cref="PaywayPaymentStatus.Unknown"/>), que quedó en revisión del
/// antifraude o esperando un paso del comprador se resuelve del lado de Payway
/// y nadie nos avisa. Sin esto, la orden quedaba pendiente para siempre aunque
/// la plata hubiera entrado.
///
/// Se consulta por nuestro id de operación (<c>siteOperationId</c>), nunca se
/// reintenta el cobro, con un intervalo que se alarga con la edad del intento
/// y hasta <see cref="PaywayPaymentAttempt.RecheckMaxAge"/>. Lo que Payway
/// resuelve se aplica a la orden por el mismo camino que el cobro en el
/// momento: <see cref="SettlePaymentHandler"/> y, si la deja pagada,
/// <see cref="PaidOrderSideEffects"/>.
/// </summary>
public sealed class PaywayReconciliationService(
    PaymentsDbContext db,
    IPaywayPaymentService payway,
    SettlePaymentHandler settle,
    PaidOrderSideEffects paidEffects,
    OrderCouponUses couponUses,
    Api.Middleware.TenantContextHolder tenantScope,
    ILogger<PaywayReconciliationService> logger)
{
    /// <summary>Cuántos intentos se consultan por pasada: Payway no publica sus límites de uso.</summary>
    public const int BatchSize = 20;

    /// <summary>Consulta los intentos a los que les toca. Devuelve cuántos consultó.</summary>
    public async Task<int> RecheckDueAsync(DateTime nowUtc, CancellationToken ct)
    {
        // Corre en un worker, sin tienda en el scope: mira los intentos de todas
        // a propósito, y cada uno se reconsulta con su tienda fijada.
        var oldest = nowUtc - PaywayPaymentAttempt.RecheckMaxAge;
        var candidates = await db.PaywayPaymentAttempts.IgnoreQueryFilters()
            .Where(a => (a.Status == PaywayPaymentStatus.Unknown
                    || a.Status == PaywayPaymentStatus.UnderReview
                    || a.Status == PaywayPaymentStatus.RequiresAction)
                && a.CreatedAtUtc > oldest)
            .OrderBy(a => a.CreatedAtUtc)
            .Take(500)
            .ToListAsync(ct);

        // Cuándo le toca a cada uno depende de cuándo se lo consultó por última
        // vez: se filtra acá y no en la base para no duplicar la regla.
        var due = candidates.Where(a => a.IsRecheckDue(nowUtc)).Take(BatchSize).ToList();
        foreach (var attempt in due)
        {
            try
            {
                tenantScope.Set(TenantId.From(attempt.TenantId));
                await RecheckAsync(attempt, nowUtc, ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                // Que uno falle no frena a los demás. Se cuenta como consultado
                // para que espere su intervalo en vez de reintentarse cada minuto.
                logger.LogError(ex, "Falló la reconsulta a Payway de {SiteTransactionId} (orden {OrderId}).",
                    attempt.SiteTransactionId, attempt.OrderId);
                attempt.MarkChecked(nowUtc);
                await db.SaveChangesAsync(ct);
            }
        }
        return due.Count;
    }

    private async Task RecheckAsync(PaywayPaymentAttempt attempt, DateTime nowUtc, CancellationToken ct)
    {
        var lookup = await payway.FindBySiteTransactionIdAsync(
            TenantId.From(attempt.TenantId), attempt.SiteTransactionId, ct);

        if (lookup.IsFailure || lookup.Value is not { } found)
        {
            // Payway no contestó, no conoce la operación (el cobro nunca le
            // llegó) o la tienda ya no tiene Payway: no hay nada que aplicar.
            if (lookup.IsFailure)
                logger.LogWarning("No se pudo reconsultar {SiteTransactionId} en Payway: {Error}.",
                    attempt.SiteTransactionId, lookup.Error.Code);
            Checked(attempt, nowUtc);
            await db.SaveChangesAsync(ct);
            return;
        }

        // La orden primero y el intento después: si aplicar a la orden falla, el
        // intento sigue "en el medio" y se vuelve a consultar. Al revés, quedaría
        // aprobado y la orden pendiente para siempre.
        await ApplyToOrderAsync(attempt, found, ct);

        attempt.Complete(
            found.Status, found.RawStatus, found.ProviderPaymentId,
            found.AuthorizationCode, found.NetworkTransactionId, found.TicketNumber,
            found.Decline?.ProviderCode, found.Decline?.ProviderDescription);
        Checked(attempt, nowUtc);
        await db.SaveChangesAsync(ct);
    }

    private async Task ApplyToOrderAsync(PaywayPaymentAttempt attempt, PaywayChargeResult found, CancellationToken ct)
    {
        switch (found.Status)
        {
            case PaywayPaymentStatus.Approved when found.ProviderPaymentId is { } paymentId:
                // Payway no manda avisos: el cobro lo armamos nosotros por el total
                // y se busca por nuestro id de operación con las credenciales de
                // la tienda del intento. Igual se exige que la venta sea de esa tienda.
                var paid = await settle.HandleAsync(attempt.OrderId, "approved", paymentId,
                    origin: new PaymentOrigin(TenantId.From(attempt.TenantId)), ct: ct);
                await paidEffects.RunIfJustPaidAsync(paid, ct);

                // Payway cobró, pero la orden ya se había cobrado por otro lado:
                // el comprador pagó dos veces y la venta quedó para revisar. (Una
                // rechazada o cancelada sin cobrar ya no cae acá: el settle la
                // deja pagada, JustPaid.)
                if (paid.IsSuccess && paid.Value.Outcome != SettleOutcome.JustPaid
                    && paid.Value.Order is { } order && order.PaymentId != paymentId)
                {
                    logger.LogError(
                        "Payway aprobó el pago {PaymentId} de la orden {OrderId}, que ya estaba {Status} con otro pago. Quedó para revisar.",
                        paymentId, attempt.OrderId, order.Status);
                }
                else
                {
                    logger.LogInformation("Payway confirmó el pago {PaymentId} de la orden {OrderId} al reconsultar.",
                        paymentId, attempt.OrderId);
                }
                break;

            case PaywayPaymentStatus.Declined:
                // El mismo resultado que un rechazo de Mercado Pago: la orden
                // pasa a fallida y el stock reservado vuelve a la venta.
                // Y el uso del cupón vuelve.
                await couponUses.ReleaseIfFailedAsync(
                    await settle.HandleAsync(attempt.OrderId, "rejected", found.ProviderPaymentId, ct: ct), ct);
                break;

            case PaywayPaymentStatus.Refunded:
                // Anulado antes de que nos enteráramos del cobro: no quedó plata.
                await couponUses.ReleaseIfFailedAsync(
                    await settle.HandleAsync(attempt.OrderId, "cancelled", found.ProviderPaymentId, ct: ct), ct);
                break;

            default:
                // En revisión, esperando al comprador o un estado que no conocemos:
                // la orden sigue pendiente y se vuelve a preguntar.
                break;
        }
    }

    private void Checked(PaywayPaymentAttempt attempt, DateTime nowUtc)
    {
        attempt.MarkChecked(nowUtc);
        if (attempt.NeedsRecheck && attempt.IsLastRecheck(nowUtc))
            logger.LogWarning(
                "El cobro {SiteTransactionId} de la orden {OrderId} sigue sin resolverse en Payway ({Status}); se deja de consultar. Revisarlo en el portal de Payway.",
                attempt.SiteTransactionId, attempt.OrderId, attempt.Status);
    }
}

/// <summary>Corre <see cref="PaywayReconciliationService"/> cada minuto.</summary>
public sealed class PaywayReconciliationWorker(
    IServiceScopeFactory scopeFactory,
    ILogger<PaywayReconciliationWorker> logger) : PollingWorker(TimeSpan.FromMinutes(1))
{
    protected override void LogPollFailure(Exception ex) =>
        logger.LogError(ex, "La reconsulta de cobros de Payway falló.");

    protected override async Task PollOnceAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var service = scope.ServiceProvider.GetRequiredService<PaywayReconciliationService>();
        await service.RecheckDueAsync(DateTime.UtcNow, ct);
    }
}
