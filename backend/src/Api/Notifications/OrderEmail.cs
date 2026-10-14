using System.Text;
using Orders.Core.Domain;

namespace Api.Notifications;

/// <summary>Arma las variables y bloques HTML de los emails de órdenes.
/// El branding (logo/color/footer) lo aplica BrandedEmailSender.</summary>
public static class OrderEmail
{

    private static string Enc(string? s) => System.Net.WebUtility.HtmlEncode(s ?? string.Empty);

    /// <summary>Tabla de items estilo Tiendanube: foto + nombre + cantidad + precio,
    /// con subtotal/envío/total al pie.</summary>
    private static string ItemsTable(Order o, IReadOnlyDictionary<Guid, string>? imageByVariant)
    {
        var sb = new StringBuilder(
            "<table role='presentation' style='width:100%;border-collapse:collapse;font-size:14px'>");

        foreach (var i in o.Items)
        {
            sb.Append("<tr style='border-bottom:1px solid #f0f0f0'>");
            if (imageByVariant is not null && imageByVariant.TryGetValue(i.VariantId, out var img))
                sb.Append("<td style='padding:10px 12px 10px 0;width:64px'>")
                  .Append("<img src='").Append(Enc(img))
                  .Append("' alt='' width='56' height='56' style='width:56px;height:56px;object-fit:cover;border-radius:6px;display:block'/></td>");
            else
                sb.Append("<td style='padding:10px 0;width:0'></td>");

            sb.Append("<td style='padding:10px 0'>")
              .Append(Enc(i.ProductName));
            if (!string.IsNullOrWhiteSpace(i.VariantDescription))
                sb.Append("<br/><span style='color:#8b8b8b;font-size:12px'>").Append(Enc(i.VariantDescription)).Append("</span>");
            sb.Append("<br/><span style='color:#8b8b8b;font-size:12px'>x").Append(i.Quantity).Append("</span>")
              .Append("</td><td style='padding:10px 0;text-align:right;white-space:nowrap;vertical-align:top'>")
              .Append(MoneyFormat.ForNotification(i.UnitPrice * i.Quantity)).Append("</td></tr>");
        }

        sb.Append("<tr><td></td><td style='padding:12px 0 2px;color:#8b8b8b'>Subtotal</td><td style='padding:12px 0 2px;text-align:right'>")
          .Append(MoneyFormat.ForNotification(o.Subtotal)).Append("</td></tr>");
        // El descuento del medio de pago va en su propio renglón: el comprador
        // tiene que poder ver que el "precio con transferencia" se respetó.
        var couponDiscount = o.CouponDiscount;
        if (couponDiscount.AmountInMinorUnits > 0)
            sb.Append("<tr><td></td><td style='padding:2px 0;color:#8b8b8b'>Descuento</td><td style='padding:2px 0;text-align:right'>- ")
              .Append(MoneyFormat.ForNotification(couponDiscount)).Append("</td></tr>");
        if (o.PaymentMethodDiscount.AmountInMinorUnits > 0)
            sb.Append("<tr><td></td><td style='padding:2px 0;color:#8b8b8b'>Descuento por ")
              .Append(o.PaymentProvider == "cash" ? "pago en efectivo" : "transferencia")
              .Append("</td><td style='padding:2px 0;text-align:right'>- ")
              .Append(MoneyFormat.ForNotification(o.PaymentMethodDiscount)).Append("</td></tr>");
        if (o.ShippingCost.AmountInMinorUnits > 0)
            sb.Append("<tr><td></td><td style='padding:2px 0;color:#8b8b8b'>Envío")
              .Append(string.IsNullOrEmpty(o.ShippingMethodName) ? string.Empty : $" · {Enc(o.ShippingMethodName)}")
              .Append("</td><td style='padding:2px 0;text-align:right'>").Append(MoneyFormat.ForNotification(o.ShippingCost)).Append("</td></tr>");
        sb.Append("<tr><td></td><td style='padding:8px 0;font-weight:bold'>Total</td><td style='padding:8px 0;text-align:right;font-weight:bold'>")
          .Append(MoneyFormat.ForNotification(o.Total)).Append("</td></tr></table>");

        if (!string.IsNullOrEmpty(o.ShippingAddress))
            sb.Append("<p style='color:#8b8b8b;font-size:13px;margin:10px 0 0'>Entrega: ")
              .Append(Enc(o.ShippingAddress)).Append("</p>");

        return sb.ToString();
    }

    /// <summary>Variables para sustituir en las plantillas editables de email.
    /// Los escalares se HTML-encodean (un nombre/tienda con &lt;script&gt; no debe
    /// ejecutarse); solo `items` es HTML confiable (armado con Enc() adentro).</summary>
    /// <remarks>
    /// {{order_id}} es el NÚMERO de pedido de la tienda ("1042"), sin el
    /// numeral: las plantillas ya escriben "#{{order_id}}". Antes era el UUID
    /// entero ("Recibimos tu pedido #3f2a…-…"), que nadie puede dictar por
    /// teléfono; las plantillas que el comercio ya editó pasan solas al número.
    /// {{tracking_link}} es la página "Seguí tu pedido" de ese pedido, con un
    /// link firmado que la abre sin pedir email ni número.
    /// </remarks>
    public static IReadOnlyDictionary<string, string> OrderVars(
        Order o, string storeName, IReadOnlyDictionary<Guid, string>? imageByVariant = null,
        string? trackingLink = null) => new Dictionary<string, string>
        {
            ["store"] = Enc(storeName),
            ["name"] = Enc(o.BuyerName),
            ["order_id"] = Enc(o.Label.TrimStart('#')),
            ["total"] = Enc(MoneyFormat.ForNotification(o.Total)),
            ["items"] = ItemsTable(o, imageByVariant),
            ["email"] = Enc(o.BuyerEmail),
            ["tracking_link"] = Enc(trackingLink ?? "#"),
        };

    public static string Refund(Order o) =>
        $@"<h2 style='margin:0 0 12px;font-size:20px'>Tu compra fue reembolsada</h2>
<p>Procesamos el reembolso de tu pedido por {MoneyFormat.ForNotification(o.Total)}.</p>
<p style='color:#8b8b8b;font-size:12px;margin-top:16px'>Pedido {Enc(o.Label)}</p>";
}
