using Api.Workers;
using Orders.Core.Features;
using Payments.Contracts;
using Payments.Core.Domain;
using Payments.Infrastructure.Persistence;

namespace Api.Payments;

/// <summary>
/// Procesa el inbox durable de webhooks de pago: hace polling de eventos pendientes
/// y los procesa idempotentemente (resuelve seller por user_id, consulta el pago
/// real y aplica el resultado a la orden), con reintentos. Sobrevive reinicios.
/// </summary>
public sealed class PaymentWebhookWorker(
    IServiceScopeFactory scopeFactory,
    ILogger<PaymentWebhookWorker> logger) : PollingWorker(TimeSpan.FromSeconds(5))
{
    protected override void LogPollFailure(Exception ex) =>
        logger.LogError(ex, "Polling de webhooks falló.");

    protected override async Task PollOnceAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var sp = scope.ServiceProvider;
        var db = sp.GetRequiredService<PaymentsDbContext>();

        await InboxDrain.DrainAsync(db, db.PaymentWebhookEvents,
            ev => ProcessAsync(sp, ev, ct),
            (ex, ev) => logger.LogError(ex, "Webhook {Id} (data {DataId}) falló, intento {Attempt}.", ev.Id, ev.DataId, ev.Attempts + 1),
            ct);
    }

    private async Task ProcessAsync(IServiceProvider sp, PaymentWebhookEvent ev, CancellationToken ct)
    {
        if (ev.Type != "payment") return; // Checkout Pro: solo topic payment

        var connections = sp.GetRequiredService<IMercadoPagoConnectionRepository>();
        var connection = await connections.GetByMercadoPagoUserIdAsync(ev.UserId, ct);
        if (connection is null)
        {
            logger.LogWarning("Webhook de user_id {UserId} sin conexión asociada; ignorado.", ev.UserId);
            return; // sin conexión no es reintentable útil; lo marcamos done
        }

        var mp = sp.GetRequiredService<IMercadoPagoPaymentService>();
        var payment = await mp.GetPaymentAsync(connection.TenantId, ev.DataId, ct);
        if (payment.IsFailure)
            throw new InvalidOperationException($"No se pudo consultar el pago {ev.DataId}: {payment.Error.Code}");

        var ext = payment.Value.ExternalReference;
        if (string.IsNullOrEmpty(ext) || !Guid.TryParse(ext, out var orderId))
        {
            logger.LogWarning("Pago {PaymentId} sin external_reference válido ('{Ext}').", ev.DataId, ext);
            return;
        }

        var settle = sp.GetRequiredService<SettlePaymentHandler>();
        var result = await settle.HandleAsync(orderId, payment.Value.Status, payment.Value.PaymentId,
            payment.Value.TransactionAmountRefunded, payment.Value.FeeAmount, ct);
        if (result.IsFailure || result.Value.Order is null) return;

        // Side-effects (emails + WhatsApp) según lo que cambió.
        var order = result.Value.Order;
        switch (result.Value.Outcome)
        {
            case SettleOutcome.JustPaid:
                await sp.GetRequiredService<Api.Orders.PaidOrderSideEffects>().RunAsync(order, ct: ct);
                break;
            case SettleOutcome.Refunded:
                // Los mismos avisos que un reembolso total desde el panel (con la
                // plantilla de la tienda); el reingreso de stock no, porque eso
                // lo decide el comercio al devolver.
                await sp.GetRequiredService<Api.Orders.RefundedOrderSideEffects>().RunAsync(order, ct);
                break;
            case SettleOutcome.PartiallyRefunded when result.Value.RefundedNow is { } refundedNow:
                // Un parcial hecho en la cuenta de Mercado Pago: el mismo aviso
                // que uno desde el panel. Solo cuando el monto devuelto creció,
                // así que un reintento del webhook no lo repite.
                await sp.GetRequiredService<Api.Orders.RefundedOrderSideEffects>()
                    .NotifyPartialAsync(order, refundedNow, Api.Orders.RefundMedium.MercadoPago, ct);
                break;
            case SettleOutcome.ChargedBack:
                logger.LogWarning("Contracargo registrado en orden {OrderId}.", order.Id);
                break;
            case SettleOutcome.Failed:
                // Rechazado sin cobrarse: el uso del cupón vuelve.
                await sp.GetRequiredService<Api.Orders.OrderCouponUses>().ReleaseAsync(order, ct);
                break;
        }

        // La nota de crédito del tramo devuelto (total o parcial), como un
        // reembolso desde el panel. La clave es el tramo: el mismo aviso
        // repetido no emite otra.
        if (result.Value is { Outcome: SettleOutcome.Refunded or SettleOutcome.PartiallyRefunded, RefundedBeforeMinor: { } before })
        {
            var after = order.RefundedAmount.AmountInMinorUnits;
            if (after > before)
                await sp.GetRequiredService<Api.Fiscal.CreditNoteIssuer>().ForRefundAsync(order, after - before,
                    global::Fiscal.Core.Domain.CreditNoteKeys.ForGatewayRefund(before, after), requested: false, ct);
        }

        // Un reembolso o un contracargo bajan lo que el cliente gastó: la agenda
        // ordena y filtra por ese número.
        if (result.Value.Outcome is SettleOutcome.Refunded or SettleOutcome.PartiallyRefunded or SettleOutcome.ChargedBack)
            await sp.GetRequiredService<Api.Crm.CustomerDirectory>().RefreshStatsAsync(order.TenantId.Value, order.BuyerEmail, ct);
    }
}
