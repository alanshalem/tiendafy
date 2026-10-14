using Api.Fiscal;
using Orders.Core.Domain;

namespace Api.Orders;

/// <summary>
/// El listado de ventas como planilla: una fila por venta, con lo que el
/// comercio mira de cada una (quién, cuánto, cómo se envió, si se cobró y se
/// despachó). Mismo formato que los libros de IVA (<see cref="VatBookCsv"/>).
/// </summary>
public static class OrderCsv
{
    // Argentina no tiene horario de verano desde 2009: UTC−3 fijo evita
    // depender de la base de zonas horarias del contenedor.
    private static readonly TimeSpan Argentina = TimeSpan.FromHours(-3);

    public const string Header =
        "Número;Fecha;Estado;Cliente;Email;Teléfono;DNI/CUIT;Productos;Unidades;Subtotal;Descuento;Envío;Total;Reembolsado;Moneda;Medio de envío;Dirección;Seguimiento;Cobrada;Enviada;Cupón;Origen";

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
    ];

    private static string LocalDateTime(DateTime utc) =>
        (DateTime.SpecifyKind(utc, DateTimeKind.Utc) + Argentina).ToString("dd/MM/yyyy HH:mm");

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
        OrderStatus.Fulfilled => o.IsPickup ? "Lista para retirar" : "Entregada",
        _ => o.Status.ToString(),
    };
}
