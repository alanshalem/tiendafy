using Inventory.Contracts;
using Microsoft.Extensions.Logging;
using Orders.Core.Domain;
using SharedKernel.Common;

namespace Orders.Core.Features;

/// <summary>Qué pasó al aplicar el pago (para que el caller dispare side-effects como emails).</summary>
public enum SettleOutcome { NoChange, JustPaid, Failed, Refunded, ChargedBack }

public sealed record SettleResult(SettleOutcome Outcome, Order? Order);

/// <summary>
/// Aplica el resultado de un pago a la orden. Idempotente: si la orden ya está
/// en estado final no reprocesa (no doble-confirma stock ni reenvía emails).
/// </summary>
public sealed class SettlePaymentHandler(
    IOrderRepository repository,
    IInventoryService inventory,
    ILogger<SettlePaymentHandler> logger)
{
    /// <param name="mpStatus">approved | pending | in_process | rejected | cancelled | refunded | charged_back ...</param>
    public async Task<Result<SettleResult>> HandleAsync(Guid orderId, string mpStatus, string? paymentId, CancellationToken ct = default)
    {
        var order = await repository.GetByIdAnyTenantAsync(orderId, ct);
        if (order is null)
            return Result.Failure<SettleResult>(Error.NotFound("Order", orderId));

        var status = mpStatus.ToLowerInvariant();

        if (status == "approved")
        {
            if (!order.IsPending)
            {
                logger.LogInformation("Order {OrderId} ya {Status}; webhook ignorado (idempotente).", orderId, order.Status);
                return new SettleResult(SettleOutcome.NoChange, order);
            }

            order.MarkPaid(paymentId ?? string.Empty);
            await repository.SaveChangesAsync(ct);

            foreach (var reservationId in order.ReservationIds)
            {
                var confirm = await inventory.ConfirmReservationAsync(order.TenantId.Value, reservationId, ct);
                if (confirm.IsFailure)
                    logger.LogWarning("Confirm reserva {ReservationId} (orden {OrderId}) falló: {Error}", reservationId, orderId, confirm.Error.Code);
            }

            logger.LogInformation("Order {OrderId} PAGADA (payment {PaymentId}).", orderId, paymentId);
            return new SettleResult(SettleOutcome.JustPaid, order);
        }

        if (status is "rejected" or "cancelled")
        {
            if (order.IsPending)
            {
                order.MarkFailed(paymentId);
                await repository.SaveChangesAsync(ct);
                foreach (var reservationId in order.ReservationIds)
                    await inventory.ReleaseReservationAsync(order.TenantId.Value, reservationId, ct);
                return new SettleResult(SettleOutcome.Failed, order);
            }
            return new SettleResult(SettleOutcome.NoChange, order);
        }

        if (status == "refunded")
        {
            if (order.MarkRefunded())
            {
                await repository.SaveChangesAsync(ct);
                logger.LogInformation("Order {OrderId} REEMBOLSADA.", orderId);
                return new SettleResult(SettleOutcome.Refunded, order);
            }
            return new SettleResult(SettleOutcome.NoChange, order);
        }

        if (status is "charged_back" or "in_mediation")
        {
            if (order.MarkChargedBack())
            {
                await repository.SaveChangesAsync(ct);
                logger.LogWarning("Order {OrderId} CONTRACARGO/disputa.", orderId);
                return new SettleResult(SettleOutcome.ChargedBack, order);
            }
            return new SettleResult(SettleOutcome.NoChange, order);
        }

        // pending / in_process → esperar siguiente webhook.
        logger.LogInformation("Order {OrderId}: pago '{Status}', sin cambios.", orderId, status);
        return new SettleResult(SettleOutcome.NoChange, order);
    }
}
