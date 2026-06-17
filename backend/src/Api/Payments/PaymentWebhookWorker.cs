using Api.Notifications;
using Orders.Core.Features;
using Payments.Contracts;
using Payments.Core.Domain;

namespace Api.Payments;

/// <summary>
/// Procesa webhooks de pago de forma async e idempotente: resuelve el seller por
/// user_id, consulta el pago real (server-side), y aplica el resultado a la orden.
/// </summary>
public sealed class PaymentWebhookWorker(
    PaymentWebhookQueue queue,
    IServiceScopeFactory scopeFactory,
    ILogger<PaymentWebhookWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var job in queue.ReadAllAsync(stoppingToken))
        {
            try { await ProcessAsync(job, stoppingToken); }
            catch (Exception ex) { logger.LogError(ex, "Webhook job falló (type {Type}, data {DataId}).", job.Type, job.DataId); }
        }
    }

    private async Task ProcessAsync(PaymentWebhookJob job, CancellationToken ct)
    {
        if (job.Type != "payment") return; // Checkout Pro: solo topic payment

        using var scope = scopeFactory.CreateScope();
        var sp = scope.ServiceProvider;

        var connections = sp.GetRequiredService<IMercadoPagoConnectionRepository>();
        var connection = await connections.GetByMercadoPagoUserIdAsync(job.UserId, ct);
        if (connection is null)
        {
            logger.LogWarning("Webhook de user_id {UserId} sin conexión asociada; ignorado.", job.UserId);
            return;
        }

        var mp = sp.GetRequiredService<IMercadoPagoPaymentService>();
        var payment = await mp.GetPaymentAsync(connection.TenantId, job.DataId, ct);
        if (payment.IsFailure)
        {
            logger.LogWarning("No se pudo consultar el pago {PaymentId}: {Error}", job.DataId, payment.Error.Code);
            return;
        }

        var ext = payment.Value.ExternalReference;
        if (string.IsNullOrEmpty(ext) || !Guid.TryParse(ext, out var orderId))
        {
            logger.LogWarning("Pago {PaymentId} sin external_reference válido ('{Ext}').", job.DataId, ext);
            return;
        }

        var settle = sp.GetRequiredService<SettlePaymentHandler>();
        var result = await settle.HandleAsync(orderId, payment.Value.Status, payment.Value.PaymentId, ct);
        if (result.IsFailure || result.Value.Order is null) return;

        // Side-effects (emails) según lo que cambió.
        var email = sp.GetRequiredService<IEmailSender>();
        var order = result.Value.Order;
        switch (result.Value.Outcome)
        {
            case SettleOutcome.JustPaid:
                await sp.GetRequiredService<OrderPaidNotifier>().NotifyAsync(order, ct);
                break;
            case SettleOutcome.Refunded:
                await email.SendAsync(order.BuyerEmail, "Tu compra fue reembolsada", OrderEmail.Refund(order), ct);
                break;
            case SettleOutcome.ChargedBack:
                logger.LogWarning("Contracargo registrado en orden {OrderId}.", order.Id);
                break;
        }
    }
}
