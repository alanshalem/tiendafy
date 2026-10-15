using Api.Notifications;
using Fiscal.Core.Abstractions;
using Orders.Core.Domain;

namespace Api.Orders;

/// <summary>
/// Lo que pasa cuando una venta queda reembolsada entera: el aviso al
/// comprador por email y WhatsApp con la plantilla "cancelacion-compra" de la
/// tienda, y la nota de crédito si estaba facturada.
///
/// Dos caminos llegan acá —el reembolso desde el panel y el que el comercio
/// hace en su cuenta de Mercado Pago, que llega por webhook— y cada uno tenía
/// su lista: el del webhook mandaba un email fijo propio, que el comercio no
/// podía editar ni apagar, en vez de su plantilla.
///
/// Best-effort paso por paso, como <see cref="PaidOrderSideEffects"/>: la plata
/// ya se devolvió; un email caído no puede tapar la nota de crédito.
/// </summary>
public sealed class RefundedOrderSideEffects(
    OrderNotifier notifier,
    BrandedEmailSender email,
    WhatsAppNotifier whatsapp,
    IFiscalEmissionQueue fiscal,
    ILogger<RefundedOrderSideEffects> logger)
{
    public const string Template = "cancelacion-compra";

    public async Task RunAsync(Order order, CancellationToken ct = default)
    {
        await StepAsync("email de reembolso", order, async () =>
        {
            // La plantilla de la tienda si la prendió; si no, el aviso genérico
            // de siempre. Un reembolso nunca pasa sin avisarle al comprador (el
            // del webhook ya avisaba así), salvo en una venta de mostrador sin email.
            if (await notifier.NotifyAsync(order, Template, ct)) return;
            if (order.BuyerEmail.EndsWith("@sin-email.local", StringComparison.OrdinalIgnoreCase)) return;
            await email.SendAsync(order.TenantId.Value, order.BuyerEmail, "Tu compra fue reembolsada", OrderEmail.Refund(order), ct);
        });
        await StepAsync("WhatsApp de reembolso", order, () => whatsapp.NotifyAsync(order, Template, ct));
        // Nota de crédito automática si la orden estaba facturada.
        await StepAsync("nota de crédito", order, () => fiscal.EnqueueCreditNoteAsync(
            order.TenantId.Value, order.Id, order.RefundedAmount.AmountInMinorUnits, order.DocNumber, ct));
    }

    private async Task StepAsync(string step, Order order, Func<Task> run)
    {
        try
        {
            await run();
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Falló el paso '{Step}' de la venta reembolsada {OrderId}.", step, order.Id);
        }
    }
}
