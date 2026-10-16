using Api.Crm;
using Api.Endpoints;
using Api.Finance;
using Inventory.Core.Domain;
using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;
using Payments.Contracts;
using Payments.Infrastructure.Persistence;
using SharedKernel.Common;

namespace Api.Orders;

/// <summary>Una venta cancelada: si se pudo anular su link de pago y cuántas reservas volvieron al stock.</summary>
public sealed record CancelledOrder(Order Order, bool LinkExpired, int ReleasedReservations);

/// <summary>
/// Deshacer una venta desde el panel: reembolsarla (total o en parte) si se
/// cobró, o cancelarla si nunca se cobró.
///
/// Vivía entero adentro de los endpoints. Acá las dependencias son explícitas
/// y el endpoint queda traduciendo request a llamada y resultado a HTTP, como
/// con <see cref="ManualOrderService"/>.
/// </summary>
public sealed class OrderRefundService(
    IOrderRepository orders,
    IMercadoPagoPaymentService mp,
    IPaywayPaymentService payway,
    PaymentsDbContext paymentsDb,
    IStockRepository stock,
    KitStockService kits,
    LedgerPoster ledger,
    CustomerDirectory customers,
    RefundedOrderSideEffects refundedEffects,
    OrderRefundLocks locks,
    ILogger<OrderRefundService> logger)
{
    /// <summary>
    /// Reembolso total o parcial. La pasarela que cobró primero (la plata:
    /// Mercado Pago o Payway), estado local después, auditoría, agenda, cuenta
    /// corriente y avisos.
    ///
    /// Lock por orden + recarga dentro del lock: dos requests concurrentes no
    /// disparan dos refunds ni dos emails. Con Payway, que no tiene
    /// idempotencia, esto es TODA la defensa contra devolver dos veces: el
    /// segundo pedido entra después del primero y recalcula lo que queda con
    /// lo que ya se devolvió.
    /// </summary>
    /// <param name="requestedBy">Quién lo pidió, para la auditoría.</param>
    public async Task<Result<Order>> RefundAsync(
        TenantId tenantId, Guid orderId, RefundRequest req, string requestedBy, CancellationToken ct)
    {
        using var turn = await locks.EnterAsync(orderId, ct);

        var order = await orders.GetByIdAsync(tenantId, orderId, ct);
        if (order is null) return Result.Failure<Order>(Error.NotFound("Order", orderId));
        if (string.IsNullOrEmpty(order.PaymentId))
            return Result.Failure<Order>(Error.Validation("Order.NoPayment", "El pedido no tiene un pago para reembolsar."));
        if (order.Status is not (OrderStatus.Paid or OrderStatus.Fulfilled or OrderStatus.PartiallyRefunded))
            return Result.Failure<Order>(Error.Conflict("Order.NotRefundable", "Solo se puede reembolsar un pedido pagado."));

        // Monto: null/0 = todo lo que queda; con valor = parcial validado server-side.
        var remaining = order.RemainingRefundable;
        var isTotal = req.Amount is null or <= 0m;
        var amount = isTotal ? remaining : Money.FromDecimal(req.Amount!.Value, order.Currency);
        if (amount.AmountInMinorUnits <= 0)
            return Result.Failure<Order>(Error.Validation("Refund.InvalidAmount", "No queda monto por reembolsar."));
        if (amount > remaining)
            return Result.Failure<Order>(OrderErrors.RefundExceedsRemaining(remaining));

        var audit = PaymentRefund.Create(
            Guid.NewGuid(), tenantId.Value, order.Id, order.PaymentId!,
            amount.AmountInMinorUnits, order.Currency,
            isTotal && order.RefundedAmount.IsZero, req.Reason, requestedBy);

        // Key de idempotencia DETERMINÍSTICA hacia MP: deriva del estado
        // acumulado + este monto. Un retry (crash antes de persistir) o un
        // doble-click con el mismo monto recomputan la MISMA key → MP
        // deduplica y NO reembolsa dos veces. Un parcial nuevo (RefundedAmount
        // ya avanzó) da otra key.
        var idemKey = $"refund-{order.Id:N}-{order.RefundedAmount.AmountInMinorUnits}-{amount.AmountInMinorUnits}";

        // La pasarela primero (la plata), estado local después. Sin monto = el
        // total del pago; con parciales previos siempre va el monto explícito.
        // Ventas manuales (efectivo/transferencia): la plata se devuelve a
        // mano — solo se registra el estado y la auditoría.
        var fullRefund = isTotal && order.RefundedAmount.IsZero;
        var gateway = await GatewayOfAsync(tenantId, order, ct);
        if (gateway == RefundGateway.Payway)
        {
            // Payway no deduplica: no hay clave que mandar. Lo que evita la
            // devolución doble es el lock de arriba y el recálculo de lo que queda.
            var refund = await payway.RefundAsync(
                tenantId, order.PaymentId!, fullRefund ? null : amount.AmountInMinorUnits, ct);
            if (refund.IsFailure) return Result.Failure<Order>(refund.Error);
            audit.AttachProviderRefundId(refund.Value.RefundId);
        }
        else if (gateway == RefundGateway.MercadoPago)
        {
            var refund = await mp.RefundAsync(tenantId, order.PaymentId!, fullRefund ? null : amount.ToDecimal(), idemKey, ct);
            if (refund.IsFailure) return Result.Failure<Order>(refund.Error);
            audit.AttachProviderRefundId(refund.Value.RefundId);
        }

        var applied = order.ApplyRefund(amount);
        if (applied.IsFailure) return Result.Failure<Order>(applied.Error);

        try
        {
            // xmin (token de concurrencia): si otra instancia ya aplicó un
            // refund a esta orden, este SaveChanges falla → 409 en vez de
            // doble aplicación local.
            await orders.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            if (gateway == RefundGateway.Payway)
            {
                // Con Mercado Pago, repetir el pedido da la misma clave y no se
                // devuelve dos veces. Con Payway, repetirlo SÍ devuelve otra vez:
                // la plata ya salió, así que hay que decirlo.
                logger.LogError(
                    "Payway devolvió {Amount} de la venta {OrderId} pero el pedido cambió antes de guardarlo.",
                    amount, order.Id);
                return Result.Failure<Order>(Error.Conflict("Refund.Concurrent",
                    "Payway ya hizo la devolución, pero el pedido cambió mientras se guardaba. No la repitas: recargá y revisá el estado."));
            }
            return Result.Failure<Order>(Error.Conflict("Refund.Concurrent",
                "El pedido cambió mientras se procesaba el reembolso. Recargá y verificá el estado."));
        }
        paymentsDb.PaymentRefunds.Add(audit);
        await paymentsDb.SaveChangesAsync(ct);
        // Lo gastado por el cliente es neto de reembolsos: la agenda lo refleja ya.
        await customers.RefreshStatsAsync(order.TenantId.Value, order.BuyerEmail, ct);

        // Venta a cuenta corriente: la plata nunca entró, así que no hay
        // nada que devolver — lo que baja es la deuda del cliente.
        if (OrderPayment.Of(order) == OrderPayment.CurrentAccount)
            await ledger.PostSaleRefundAsync(
                tenantId.Value, order.Id, audit.Id,
                $"Reembolso venta {order.Label}",
                amount.AmountInMinorUnits, order.Currency, DateTime.UtcNow, req.Reason, ct);

        if (order.Status == OrderStatus.Refunded)
        {
            await refundedEffects.RunAsync(order, ct);

            // Devolución física: reingresar el stock (opt-in del operador,
            // solo con reembolso TOTAL — un parcial no dice qué volvió).
            if (req.Restock)
                await RestockAsync(tenantId, order, ct);
        }
        return order;
    }

    public enum RefundGateway { Manual, MercadoPago, Payway }

    /// <summary>
    /// Por dónde entró la plata de la venta. La orden no lo guarda (las de
    /// Payway quedan con <c>PaymentProvider = "mercadopago"</c>, el default, y
    /// los ids de pago de las dos pasarelas son números): lo que la distingue
    /// es el intento de Payway que la cobró, con ese mismo id de pago. El
    /// panel lo usa para decir por dónde vuelve la plata al reembolsar.
    /// </summary>
    public async Task<RefundGateway?> GatewayOfAsync(TenantId tenantId, Order order, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(order.PaymentId)) return null;
        if (order.PaymentId.StartsWith(OrderPayment.ManualPrefix, StringComparison.Ordinal))
            return RefundGateway.Manual;

        var paidWithPayway = await paymentsDb.PaywayPaymentAttempts.AsNoTracking()
            .AnyAsync(a => a.TenantId == tenantId.Value && a.OrderId == order.Id
                && a.ProviderPaymentId == order.PaymentId, ct);
        return paidWithPayway ? RefundGateway.Payway : RefundGateway.MercadoPago;
    }

    private async Task RestockAsync(TenantId tenantId, Order order, CancellationToken ct)
    {
        foreach (var item in order.Items)
        {
            try
            {
                await stock.AdjustAvailableAsync(
                    tenantId, item.VariantId, item.Quantity,
                    $"Devolución venta {order.Label}", ct);
            }
            catch (Exception ex)
            {
                // Best-effort: el reembolso ya está hecho; el ajuste manual de
                // stock queda como recurso. Pero que quede escrito, o nadie se
                // entera de que el stock de esa variante quedó corto.
                logger.LogWarning(ex,
                    "No se pudo reingresar el stock de la variante {VariantId} de la venta reembolsada {OrderId}.",
                    item.VariantId, order.Id);
            }
        }
        // Kits: la venta descontó los COMPONENTES, así que la devolución los
        // devuelve (si no, quedaban descontados).
        await kits.ReverseAsync(order, ct);
    }

    /// <summary>
    /// Cancelar una venta que nunca se cobró. Anula el link de pago (para que
    /// no pague algo que ya no existe), libera el stock reservado y deja
    /// escrito quién la canceló y por qué.
    /// </summary>
    public async Task<Result<CancelledOrder>> CancelAsync(
        TenantId tenantId, Guid orderId, string? reason, string cancelledBy, CancellationToken ct)
    {
        var order = await orders.GetByIdAsync(tenantId, orderId, ct);
        if (order is null) return Result.Failure<CancelledOrder>(Error.NotFound("Order", orderId));
        var cancellable = order.EnsureCancellable();
        if (cancellable.IsFailure) return Result.Failure<CancelledOrder>(cancellable.Error);

        // El link primero: si se anulara después, entre cancelar y anular
        // el comprador todavía podría pagar una venta ya cancelada.
        var linkExpired = false;
        if (order.PreferenceId is { Length: > 0 } preference)
        {
            var expired = await mp.ExpirePreferenceAsync(tenantId, preference, ct);
            linkExpired = expired.IsSuccess;
            if (expired.IsFailure)
                logger.LogWarning(
                    "No se pudo vencer la preference {Preference} de la venta {OrderId}: {Error}",
                    preference, order.Id, expired.Error.Code);
        }

        var cancelled = order.Cancel(cancelledBy, reason);
        if (cancelled.IsFailure) return Result.Failure<CancelledOrder>(cancelled.Error);
        try
        {
            await orders.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Result.Failure<CancelledOrder>(Error.Conflict("Order.Concurrent",
                "La venta cambió mientras se cancelaba (puede que se haya pagado). Recargá y revisala."));
        }

        // Una reserva que ya venció (o ya se liberó) no es un error: el
        // stock ya había vuelto solo.
        var released = 0;
        foreach (var reservationId in order.ReservationIds)
            if ((await stock.ReleaseReservationAsync(tenantId, reservationId, ct)).IsSuccess)
                released++;

        return new CancelledOrder(order, linkExpired, released);
    }
}
