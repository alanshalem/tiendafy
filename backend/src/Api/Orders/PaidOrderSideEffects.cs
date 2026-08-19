using Api.Crm;
using Api.Notifications;
using Discounts.Infrastructure;
using Fiscal.Core.Abstractions;
using Fiscal.Core.Domain;
using Microsoft.EntityFrameworkCore;
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
    DiscountsDbContext discounts,
    CustomerDirectory customers,
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

        await StepAsync("uso del cupón", order, () => RegisterCouponUseAsync(order, ct));

        // La venta deja su ficha en Clientes: quien compra como invitado también
        // es un cliente de la tienda.
        await StepAsync("ficha del cliente", order, () => customers.UpsertFromOrderAsync(order, ct));
    }

    /// <summary>
    /// Suma un uso al cupón de la venta. El contador ya se mostraba en el panel
    /// y el límite "máximo N usos" ya se validaba… pero nadie lo incrementaba:
    /// un cupón con tope era, en los hechos, ilimitado. Se cuenta al PAGARSE y
    /// no al crear la orden, así "usos" son ventas cobradas y no intentos.
    /// </summary>
    private async Task RegisterCouponUseAsync(Order order, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(order.CouponCode)) return;

        var code = order.CouponCode.Trim().ToUpperInvariant();
        var coupon = await discounts.Coupons
            .FirstOrDefaultAsync(c => c.TenantId == order.TenantId.Value && c.Code == code, ct);
        if (coupon is null) return;

        coupon.RegisterUse();
        await discounts.SaveChangesAsync(ct);
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
