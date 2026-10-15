using Api.Fiscal;
using Orders.Core.Domain;
using SharedKernel.Common;

namespace Api.Orders;

/// <summary>
/// El listado de ventas como planilla: una fila por venta, con lo que el
/// comercio mira de cada una (quién, cuánto, cómo se envió, si se cobró y se
/// despachó). Mismo formato que los libros de IVA (<see cref="VatBookCsv"/>).
/// </summary>
public static class OrderCsv
{
    public const string Header =
        "Número;Fecha;Estado;Cliente;Email;Teléfono;DNI/CUIT;Productos;Unidades;Subtotal;Descuento;Envío;Total;Reembolsado;Moneda;Medio de envío;Dirección;Seguimiento;Cobrada;Enviada;Cupón;Origen;Canal;Cobro";

    public static IEnumerable<string?> Row(Order o) =>
    [
        o.Label,
        LocalDateTime(o.CreatedAtUtc),
        StatusLabel(o),
        VatBookCsv.Text(o.BuyerName),
        VatBookCsv.Text(o.BuyerEmail),
        VatBookCsv.Text(o.BuyerPhone),
        VatBookCsv.Text(o.DocNumber),
        VatBookCsv.Text(string.Join(" | ", o.Items.Select(i =>
            $"{i.Quantity} x {i.ProductName}{(string.IsNullOrWhiteSpace(i.VariantDescription) ? "" : $" ({i.VariantDescription})")}"))),
        o.Items.Sum(i => i.Quantity).ToString(System.Globalization.CultureInfo.InvariantCulture),
        VatBookCsv.Amount(o.Subtotal.ToDecimal()),
        VatBookCsv.Amount(o.DiscountAmount.ToDecimal()),
        VatBookCsv.Amount(o.ShippingCost.ToDecimal()),
        VatBookCsv.Amount(o.Total.ToDecimal()),
        VatBookCsv.Amount(o.RefundedAmount.ToDecimal()),
        o.Currency,
        VatBookCsv.Text(o.IsPickup ? $"Retiro en el local{(o.ShippingMethodName is { Length: > 0 } m ? $" ({m})" : "")}" : o.ShippingMethodName),
        VatBookCsv.Text(o.ShippingAddress),
        VatBookCsv.Text(o.Tracking),
        o.PaidAtUtc is { } paid ? LocalDateTime(paid) : "",
        o.FulfilledAtUtc is { } sent ? LocalDateTime(sent) : "",
        VatBookCsv.Text(o.CouponCode),
        VatBookCsv.Text(o.UtmSource),
        ChannelLabel(o.Channel),
        PaymentLabel(OrderPayment.Of(o)),
    ];

    /// <summary>Los mismos nombres que el filtro de canal del panel.</summary>
    private static string ChannelLabel(string channel) => channel switch
    {
        Order.ChannelManual => "Venta manual",
        Order.ChannelQuote => "Presupuesto",
        _ => "Tienda online",
    };

    private static string PaymentLabel(string? method) => method switch
    {
        OrderPayment.Cash => "Efectivo",
        OrderPayment.Transfer => "Transferencia",
        OrderPayment.CurrentAccount => "Cuenta corriente",
        OrderPayment.Gateway => "Pago online",
        _ => "",
    };

    private static string LocalDateTime(DateTime utc) =>
        ArgentinaTime.ToLocal(utc).ToString("dd/MM/yyyy HH:mm");

    /// <summary>Los mismos nombres que el panel (lib/orderStatus.ts del admin).</summary>
    private static string StatusLabel(Order o) => o.Status switch
    {
        OrderStatus.PendingPayment => "Pendiente",
        OrderStatus.Paid => "Pagada",
        OrderStatus.Failed => "Fallida",
        OrderStatus.Cancelled => "Cancelada",
        OrderStatus.Refunded => "Reembolsada",
        OrderStatus.PartiallyRefunded => "Reembolso parcial",
        OrderStatus.ChargedBack => "Contracargo",
        // Despachada, no entregada: el sistema no se entera de la entrega.
        OrderStatus.Fulfilled => o.IsPickup ? "Lista para retirar" : "Enviada",
        _ => o.Status.ToString(),
    };
}
