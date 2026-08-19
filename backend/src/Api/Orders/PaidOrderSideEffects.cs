using Api.Notifications;
using Fiscal.Core.Abstractions;
using Fiscal.Core.Domain;
using Orders.Core.Domain;

namespace Api.Orders;

/// <summary>
/// Lo que pasa cuando una orden queda pagada: descuento de stock de los kits,
/// email y WhatsApp de confirmación, y factura automática si el trigger de la
/// tienda es "al pagar". Tres caminos llegan al mismo estado — tarjeta on-site,
/// webhook de Mercado Pago y venta manual — y cada uno tenía su copia de esta
/// lista, ya divergida: la del pago on-site nunca encolaba la factura.
///
/// Best-effort paso por paso: la plata ya entró, así que un email caído no
/// puede tapar los efectos que vienen atrás (antes, una excepción en el stock
/// de kits se llevaba puesto el resto y no volvían — el reintento del webhook
/// no vuelve a dar "recién pagada" porque el settle es idempotente).
/// </summary>
public sealed class PaidOrderSideEffects(
    KitStockService kitStock,
    OrderNotifier notifier,
    WhatsAppNotifier whatsapp,
    IFiscalEmissionQueue fiscal,
    ILogger<PaidOrderSideEffects> logger)
{
    /// <param name="whatsApp">
    /// Las ventas manuales (mostrador) no mandan WhatsApp: el comprador está
    /// enfrente y el mensaje llega como spam.
    /// </param>
    public async Task RunAsync(Order order, bool whatsApp = true, CancellationToken ct = default)
    {
        await StepAsync("descuento de stock de kits", order, () => kitStock.ApplyAsync(order, ct));

        // Una venta manual sin datos del comprador lleva un email placeholder:
        // no es un destino real y rebota.
        if (!order.BuyerEmail.EndsWith("@sin-email.local", StringComparison.OrdinalIgnoreCase))
            await StepAsync("email de confirmación", order, () => notifier.NotifyAsync(order, "confirmacion-pago", ct));

        if (whatsApp)
            await StepAsync("WhatsApp de confirmación", order, () => whatsapp.NotifyAsync(order, "confirmacion-pago", ct));

        await StepAsync("factura automática", order, () => fiscal.EnqueueInvoiceAsync(
            order.TenantId.Value, order.Id, order.Total.AmountInMinorUnits,
            order.DocNumber, EmissionTrigger.OnPayment, ct));
    }

    private async Task StepAsync(string step, Order order, Func<Task> run)
    {
        try
        {
            await run();
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Falló el {Step} de la orden pagada {OrderId}.", step, order.Id);
        }
    }
}
