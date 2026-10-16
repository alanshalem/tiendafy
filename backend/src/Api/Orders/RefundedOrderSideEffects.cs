using System.Net;
using Api.Notifications;
using Orders.Core.Domain;
using SharedKernel.Common;

namespace Api.Orders;

/// <summary>
/// Lo que pasa cuando una venta queda reembolsada entera: el aviso al
/// comprador por email y WhatsApp con la plantilla "cancelacion-compra" de la
/// tienda, y el aviso de un reembolso parcial (<see cref="NotifyPartialAsync"/>).
/// La nota de crédito ya no va acá: sale por cada reembolso, total o parcial
/// (<see cref="Api.Fiscal.CreditNoteIssuer"/>).
///
/// Dos caminos llegan acá —el reembolso desde el panel y el que el comercio
/// hace en su cuenta de Mercado Pago, que llega por webhook— y cada uno tenía
/// su lista: el del webhook mandaba un email fijo propio, que el comercio no
/// podía editar ni apagar, en vez de su plantilla.
///
/// Best-effort paso por paso, como <see cref="PaidOrderSideEffects"/>: la plata
/// ya se devolvió; un email caído no puede tapar el WhatsApp.
/// </summary>
public sealed class RefundedOrderSideEffects(
    OrderNotifier notifier,
    BrandedEmailSender email,
    WhatsAppNotifier whatsapp,
    ILogger<RefundedOrderSideEffects> logger)
{
    public const string Template = "cancelacion-compra";
    public const string PartialTemplate = "reembolso-parcial";

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
    }

    /// <summary>
    /// El aviso de un reembolso parcial: cuánto se devolvió en ESTE reembolso y
    /// por dónde vuelve, con la plantilla "reembolso-parcial" (la de la tienda si
    /// la prendió; si no, su texto de fábrica). Antes un parcial no avisaba nada.
    /// Una vez por reembolso: el panel llega acá una vez por pedido de reembolso
    /// (bajo el lock de la venta) y el webhook solo cuando el monto devuelto
    /// creció, así que un reintento del aviso no lo repite.
    /// Solo email: la plantilla de WhatsApp de reembolso dice que se devolvió
    /// el total, y no hay una aprobada para un parcial.
    /// </summary>
    public Task NotifyPartialAsync(Order order, Money amount, RefundMedium medium, CancellationToken ct = default) =>
        StepAsync("email de reembolso parcial", order, () => notifier.NotifyWithDefaultAsync(order, PartialTemplate,
            new Dictionary<string, string>
            {
                ["refund_amount"] = WebUtility.HtmlEncode(MoneyFormat.ForNotification(amount)),
                ["refund_method"] = WebUtility.HtmlEncode(RefundMediums.BuyerText(medium)),
            }, ct));

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
