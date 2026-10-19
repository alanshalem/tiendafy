using Inventory.Contracts;
using Microsoft.Extensions.Logging;
using Orders.Core.Domain;
using SharedKernel.Common;

namespace Orders.Core.Features;

/// <summary>Qué pasó al aplicar el pago (para que el caller dispare side-effects como emails).</summary>
public enum SettleOutcome { NoChange, JustPaid, Failed, Refunded, ChargedBack, PartiallyRefunded }

/// <param name="RefundedNow">
/// Lo que se devolvió en ESTE aviso, cuando sincronizó un reembolso parcial
/// hecho en Mercado Pago (el aviso al comprador dice cuánto).
/// </param>
/// <param name="RefundedBeforeMinor">
/// En un reembolso: cuánto estaba devuelto antes de este aviso (en centavos).
/// Con lo devuelto ahora (<c>Order.RefundedAmount</c>) dice qué tramo se
/// devolvió, y eso identifica la nota de crédito que le corresponde.
/// </param>
public sealed record SettleResult(
    SettleOutcome Outcome, Order? Order, Money? RefundedNow = null, long? RefundedBeforeMinor = null);

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
    /// <param name="amountRefunded">transaction_amount_refunded del pago en MP: si supera lo
    /// registrado localmente, sincroniza reembolsos parciales hechos fuera del sistema.</param>
    public async Task<Result<SettleResult>> HandleAsync(Guid orderId, string mpStatus, string? paymentId, decimal? amountRefunded = null, decimal? mpFee = null, CancellationToken ct = default)
    {
        var order = await repository.GetByIdAnyTenantAsync(orderId, ct);
        if (order is null)
            return Result.Failure<SettleResult>(Error.NotFound("Order", orderId));

        var status = mpStatus.ToLowerInvariant();

        if (status == "approved")
        {
            if (!order.IsPending)
            {
                // La comisión de un pago que se aplicó sin ella: el cobro con
                // tarjeta en la tienda (Brick) marca la orden pagada en el momento
                // y MP no informa el neto en esa respuesta. Cuando llega el
                // webhook del MISMO pago, la orden ya está pagada; se completa la
                // comisión y nada más: no es "recién pagada", así que los avisos,
                // la factura y el stock no vuelven a correr.
                var feeRecorded = TryRecordMissingFee(order, paymentId, mpFee);

                // Sync de refund parcial hecho en el dashboard de MP: el pago sigue
                // "approved" pero transaction_amount_refunded crece.
                if (amountRefunded is > 0m)
                {
                    var target = Money.FromDecimal(amountRefunded.Value, order.Currency);
                    if (target > order.RefundedAmount)
                    {
                        var before = order.RefundedAmount.AmountInMinorUnits;
                        var delta = target - order.RefundedAmount;
                        var applied = order.ApplyRefund(delta);
                        if (applied.IsSuccess)
                        {
                            await repository.SaveChangesAsync(ct);
                            logger.LogInformation("Order {OrderId}: refund parcial sincronizado desde MP ({Delta}).", orderId, delta);
                            return new SettleResult(
                                order.Status == OrderStatus.Refunded ? SettleOutcome.Refunded : SettleOutcome.PartiallyRefunded,
                                order, delta, before);
                        }
                    }
                }
                if (feeRecorded)
                {
                    await repository.SaveChangesAsync(ct);
                    logger.LogInformation("Order {OrderId} ya {Status}: se registró la comisión de MP ({Fee}).",
                        orderId, order.Status, order.MpFeeAmount);
                    return new SettleResult(SettleOutcome.NoChange, order);
                }

                logger.LogInformation("Order {OrderId} ya {Status}; webhook ignorado (idempotente).", orderId, order.Status);
                return new SettleResult(SettleOutcome.NoChange, order);
            }

            order.MarkPaid(paymentId ?? string.Empty);
            // Comisión real de MP (transaction − neto acreditado): rentabilidad.
            if (mpFee is > 0m)
                order.RecordMpFee(Money.FromDecimal(mpFee.Value, order.Currency));
            // Guardar primero es lo que reclama el pago: si otro aviso del mismo
            // pago la dejó pagada en el mismo instante, este guardado choca
            // (xmin) y el stock no se toca dos veces.
            await repository.SaveChangesAsync(ct);

            await SettleStockAsync(order, ct);

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
            var before = order.RefundedAmount.AmountInMinorUnits;
            if (order.MarkRefunded())
            {
                await repository.SaveChangesAsync(ct);
                logger.LogInformation("Order {OrderId} REEMBOLSADA.", orderId);
                return new SettleResult(SettleOutcome.Refunded, order, RefundedBeforeMinor: before);
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

    /// <summary>
    /// El stock de la venta recién pagada (ver <see cref="PaidOrderStock"/>).
    /// Si no alcanzó para algún producto, la venta queda "para revisar" con lo
    /// que falta. Ese guardado no puede deshacer el pago: si choca con otro
    /// cambio de la venta, queda en el log y la venta sigue pagada.
    /// </summary>
    private async Task SettleStockAsync(Order order, CancellationToken ct)
    {
        var shortages = await PaidOrderStock.SettleAsync(inventory, order, logger, ct);
        if (shortages.Count == 0) return;

        order.AddReviewNote(PaidOrderStock.ShortageNote(shortages));
        try
        {
            await repository.SaveChangesAsync(ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "La orden {OrderId} se pagó sin stock y no se pudo dejar para revisar.", order.Id);
        }
    }

    /// <summary>
    /// Completa la comisión de MP de una orden que ya se cobró, si le falta. Solo
    /// con el mismo pago que la cobró (no la de otro pago que apunte a la misma
    /// orden) y sin pisar una comisión ya guardada.
    /// </summary>
    private static bool TryRecordMissingFee(Order order, string? paymentId, decimal? mpFee)
    {
        if (mpFee is not > 0m || order.MpFeeAmount is not null || order.PaidAtUtc is null) return false;
        if (string.IsNullOrEmpty(paymentId) || !string.Equals(order.PaymentId, paymentId, StringComparison.Ordinal))
            return false;

        order.RecordMpFee(Money.FromDecimal(mpFee.Value, order.Currency));
        return true;
    }
}
