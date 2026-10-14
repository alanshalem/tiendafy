using Api.Notifications;
using Api.Shipping;
using Checkout.Infrastructure.Persistence;
using Fiscal.Infrastructure.Persistence;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;

namespace Api.Orders;

/// <summary>Cuánto se muestra de un pedido según quién pregunta.</summary>
public enum OrderViewAccess
{
    /// <summary>Solo con el id (la página de "gracias por tu compra").</summary>
    ById,

    /// <summary>Con email + número, o con el link firmado del mail.</summary>
    Tracking,

    /// <summary>El comprador logueado, dueño del pedido (su cuenta).</summary>
    Owner,
}

/// <summary>
/// Lo que el comprador ve de su pedido, en la página de gracias, en "Seguí tu
/// pedido" y en su cuenta: una sola forma para los tres, así no hay una
/// pantalla que diga "enviado" y otra "pagado" del mismo pedido.
///
/// Nunca lleva el teléfono ni el DNI. La dirección de entrega solo va cuando
/// quien pregunta demostró ser el comprador (email + número, el link del mail
/// o su sesión); con el id solo, recién en las primeras horas: es la página a
/// la que vuelve de pagar, y después ese link puede estar en cualquier historial.
/// </summary>
public sealed class OrderTrackingView(
    CheckoutDbContext checkout,
    FiscalDbContext fiscal,
    OrderItemImages images,
    IDataProtectionProvider dp)
{
    /// <summary>Hasta cuándo la página de gracias muestra la dirección de entrega.</summary>
    private static readonly TimeSpan FreshOrderWindow = TimeSpan.FromHours(24);

    public async Task<object> BuildAsync(Order order, OrderViewAccess access, CancellationToken ct)
    {
        var tenantGuid = order.TenantId.Value;

        var andreani = await checkout.AndreaniShipments.AsNoTracking()
            .Where(s => s.TenantId == tenantGuid && s.OrderId == order.Id)
            .Select(s => new { s.TrackingNumber, s.Status })
            .FirstOrDefaultAsync(ct);
        var zipnova = await checkout.ZipnovaShipments.AsNoTracking()
            .Where(s => s.TenantId == tenantGuid && s.OrderId == order.Id)
            .OrderByDescending(s => s.CreatedAtUtc)
            .Select(s => new { s.CarrierName, s.CarrierTrackingId, s.TrackingUrl, s.Status })
            .FirstOrDefaultAsync(ct);

        var tracking = CarrierTrackingLink.For(
            order.Tracking, order.ShippingMethodName, andreani?.TrackingNumber,
            zipnova is null ? null : (zipnova.CarrierName, zipnova.CarrierTrackingId, zipnova.TrackingUrl));

        var delivered = andreani?.Status == Checkout.Core.Domain.AndreaniShipmentStatus.Delivered
            || string.Equals(zipnova?.Status, "delivered", StringComparison.OrdinalIgnoreCase);

        var pickupAddress = order.IsPickup ? await PickupAddressAsync(order, ct) : null;

        var showAddress = access != OrderViewAccess.ById
            || DateTime.UtcNow - order.CreatedAtUtc < FreshOrderWindow;

        var invoiceAvailable = access == OrderViewAccess.Owner
            && await fiscal.Documents.AsNoTracking().AnyAsync(d =>
                d.TenantId == tenantGuid && d.OrderId == order.Id
                && d.Result == global::Fiscal.Core.Domain.FiscalResult.Authorized
                && d.CbteTipo != global::Fiscal.Core.Domain.CbteTipo.NotaCreditoA
                && d.CbteTipo != global::Fiscal.Core.Domain.CbteTipo.NotaCreditoB
                && d.CbteTipo != global::Fiscal.Core.Domain.CbteTipo.NotaCreditoC, ct);

        var imageMap = await images.ForOrderAsync(order, ct);

        // Transferencia o efectivo pendiente: cuánto, a qué cuenta y hasta cuándo.
        var paymentOptions = order.IsOfflinePayment && order.Status == OrderStatus.PendingPayment
            ? await checkout.PaymentOptions.AsNoTracking().FirstOrDefaultAsync(o => o.TenantId == order.TenantId, ct)
            : null;

        return new
        {
            order.Id,
            order.Number,
            label = order.Label,
            status = order.Status.ToString().ToUpperInvariant(),
            order.IsPickup,
            order.CreatedAtUtc,
            order.PaidAtUtc,
            order.FulfilledAtUtc,
            order.Currency,
            paymentProvider = order.PaymentProvider,
            subtotal = ApiJson.MoneyJson(order.Subtotal),
            discount = ApiJson.MoneyJson(order.DiscountAmount),
            shipping = ApiJson.MoneyJson(order.ShippingCost),
            total = ApiJson.MoneyJson(order.Total),
            refunded = ApiJson.MoneyJson(order.RefundedAmount),
            shippingMethod = order.ShippingMethodName,
            pickupAddress,
            shippingAddress = showAddress && !order.IsPickup ? order.ShippingAddress : null,
            buyerEmailHint = MaskEmail(order.BuyerEmail),
            items = order.Items.Select(i => new
            {
                i.VariantId,
                i.ProductName,
                i.VariantDescription,
                i.Quantity,
                unitPrice = ApiJson.MoneyJson(i.UnitPrice),
                image = imageMap.TryGetValue(i.VariantId, out var img) ? img : null,
            }),
            tracking,
            timeline = Timeline(order, delivered),
            // El arrepentimiento corre desde la entrega: se ofrece mientras el
            // pedido está vigente (cobrado o enviado); el comercio decide el plazo.
            canRepent = OrderStatuses.IsEarning(order.Status),
            invoiceAvailable,
            trackingToken = OrderTrackingToken.Protect(dp, tenantGuid, order.Id),
            paymentInstructions = OfflinePaymentEmail.ForOrderView(order, paymentOptions),
        };
    }

    /// <summary>El domicilio del local, del medio de envío que eligió el comprador.</summary>
    private async Task<string?> PickupAddressAsync(Order order, CancellationToken ct)
    {
        var methodId = await checkout.Sessions.AsNoTracking()
            .Where(s => s.Id == order.CheckoutSessionId && s.TenantId == order.TenantId)
            .Select(s => s.ShippingMethodId)
            .FirstOrDefaultAsync(ct);
        if (methodId is null) return null;
        return await checkout.ShippingMethods.AsNoTracking()
            .Where(m => m.Id == methodId && m.TenantId == order.TenantId)
            .Select(m => m.PickupAddress)
            .FirstOrDefaultAsync(ct);
    }

    /// <summary>
    /// Los pasos del pedido, en el orden en que se dan. Los que no pasaron
    /// todavía van sin fecha; un final distinto (cancelado, reembolsado) se
    /// agrega al final, que es donde lo busca quien mira.
    /// </summary>
    public static IReadOnlyList<TimelineStep> Timeline(Order order, bool delivered)
    {
        var steps = new List<TimelineStep>
        {
            new("received", "Recibimos tu pedido", order.CreatedAtUtc, true),
        };

        if (order.Status is OrderStatus.Failed or OrderStatus.Cancelled)
        {
            steps.Add(new("cancelled", order.Status == OrderStatus.Failed ? "El pago fue rechazado" : "Pedido cancelado", null, true));
            return steps;
        }

        steps.Add(new("paid", "Pago acreditado", order.PaidAtUtc, order.PaidAtUtc is not null));
        steps.Add(new("fulfilled", order.IsPickup ? "Listo para retirar" : "Despachado",
            order.FulfilledAtUtc, order.FulfilledAtUtc is not null));
        if (!order.IsPickup)
            steps.Add(new("delivered", "Entregado", null, delivered));

        var ending = order.Status switch
        {
            OrderStatus.Refunded => "Reembolsado",
            OrderStatus.PartiallyRefunded => "Reembolso parcial",
            OrderStatus.ChargedBack => "En disputa con el medio de pago",
            _ => null,
        };
        if (ending is not null) steps.Add(new("refunded", ending, null, true));
        return steps;
    }

    /// <summary>"ana@gmail.com" → "a**@gmail.com": para confirmar a qué casilla fue, sin mostrarla.</summary>
    public static string MaskEmail(string email)
    {
        var at = email.IndexOf('@');
        if (at <= 0) return "***";
        var local = email[..at];
        return $"{local[0]}{new string('*', Math.Clamp(local.Length - 1, 2, 6))}{email[at..]}";
    }
}

public sealed record TimelineStep(string Key, string Label, DateTime? AtUtc, bool Done);
