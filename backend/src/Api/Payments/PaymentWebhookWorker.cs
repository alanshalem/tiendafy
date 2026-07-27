using Api.Notifications;
using Microsoft.EntityFrameworkCore;
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
    ILogger<PaymentWebhookWorker> logger) : BackgroundService
{
    private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(5);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try { await PollOnceAsync(stoppingToken); }
            catch (Exception ex) { logger.LogError(ex, "Polling de webhooks falló."); }
            try { await Task.Delay(PollInterval, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }

    private async Task PollOnceAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var sp = scope.ServiceProvider;
        var db = sp.GetRequiredService<PaymentsDbContext>();

        var pending = await db.PaymentWebhookEvents
            .Where(e => e.Status == PaymentWebhookEvent.StatusPending)
            .OrderBy(e => e.CreatedAtUtc)
            .Take(20)
            .ToListAsync(ct);

        foreach (var ev in pending)
        {
            try
            {
                await ProcessAsync(sp, ev, ct);
                ev.MarkDone();
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Webhook {Id} (data {DataId}) falló, intento {Attempt}.", ev.Id, ev.DataId, ev.Attempts + 1);
                ev.MarkFailed(ex.Message);
            }
            await db.SaveChangesAsync(ct);
        }
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
            payment.Value.TransactionAmountRefunded, ct);
        if (result.IsFailure || result.Value.Order is null) return;

        // Side-effects (emails + WhatsApp) según lo que cambió.
        var email = sp.GetRequiredService<BrandedEmailSender>();
        var whatsapp = sp.GetRequiredService<WhatsAppNotifier>();
        var order = result.Value.Order;
        switch (result.Value.Outcome)
        {
            case SettleOutcome.JustPaid:
                await sp.GetRequiredService<OrderNotifier>().NotifyAsync(order, "confirmacion-pago", ct);
                await whatsapp.NotifyAsync(order, "confirmacion-pago", ct);
                // Factura automática si el trigger configurado es "al pagar".
                await sp.GetRequiredService<global::Fiscal.Core.Abstractions.IFiscalEmissionQueue>()
                    .EnqueueInvoiceAsync(order.TenantId.Value, order.Id, order.Total.AmountInMinorUnits,
                        order.DocNumber, global::Fiscal.Core.Domain.EmissionTrigger.OnPayment, ct);
                break;
            case SettleOutcome.Refunded:
                await email.SendAsync(order.TenantId.Value, order.BuyerEmail, "Tu compra fue reembolsada", OrderEmail.Refund(order), ct);
                await whatsapp.NotifyAsync(order, "cancelacion-compra", ct);
                break;
            case SettleOutcome.ChargedBack:
                logger.LogWarning("Contracargo registrado en orden {OrderId}.", order.Id);
                break;
        }
    }
}
