using System.Text;
using Orders.Core.Domain;

namespace Api.Notifications;

/// <summary>Arma las variables y bloques HTML de los emails de órdenes.
/// El branding (logo/color/footer) lo aplica BrandedEmailSender.</summary>
public static class OrderEmail
{
    private static string Money(SharedKernel.Common.Money m) => MoneyFormat.ForNotification(m);

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
              .Append(Money(i.UnitPrice * i.Quantity)).Append("</td></tr>");
        }

        sb.Append("<tr><td></td><td style='padding:12px 0 2px;color:#8b8b8b'>Subtotal</td><td style='padding:12px 0 2px;text-align:right'>")
          .Append(Money(o.Subtotal)).Append("</td></tr>");
        if (o.DiscountAmount.AmountInMinorUnits > 0)
            sb.Append("<tr><td></td><td style='padding:2px 0;color:#8b8b8b'>Descuento</td><td style='padding:2px 0;text-align:right'>- ")
              .Append(Money(o.DiscountAmount)).Append("</td></tr>");
        if (o.ShippingCost.AmountInMinorUnits > 0)
            sb.Append("<tr><td></td><td style='padding:2px 0;color:#8b8b8b'>Envío")
              .Append(string.IsNullOrEmpty(o.ShippingMethodName) ? string.Empty : $" · {Enc(o.ShippingMethodName)}")
              .Append("</td><td style='padding:2px 0;text-align:right'>").Append(Money(o.ShippingCost)).Append("</td></tr>");
        sb.Append("<tr><td></td><td style='padding:8px 0;font-weight:bold'>Total</td><td style='padding:8px 0;text-align:right;font-weight:bold'>")
          .Append(Money(o.Total)).Append("</td></tr></table>");

        if (!string.IsNullOrEmpty(o.ShippingAddress))
            sb.Append("<p style='color:#8b8b8b;font-size:13px;margin:10px 0 0'>Entrega: ")
              .Append(Enc(o.ShippingAddress)).Append("</p>");

        return sb.ToString();
    }

    /// <summary>Variables para sustituir en las plantillas editables de email.
    /// Los escalares se HTML-encodean (un nombre/tienda con &lt;script&gt; no debe
    /// ejecutarse); solo `items` es HTML confiable (armado con Enc() adentro).</summary>
    public static IReadOnlyDictionary<string, string> OrderVars(
        Order o, string storeName, IReadOnlyDictionary<Guid, string>? imageByVariant = null) => new Dictionary<string, string>
        {
            ["store"] = Enc(storeName),
            ["name"] = Enc(o.BuyerName),
            ["order_id"] = Enc(o.Id.ToString()),
            ["total"] = Enc(Money(o.Total)),
            ["items"] = ItemsTable(o, imageByVariant),
            ["email"] = Enc(o.BuyerEmail),
        };

    public static string Refund(Order o) =>
        $@"<h2 style='margin:0 0 12px;font-size:20px'>Tu compra fue reembolsada</h2>
<p>Procesamos el reembolso de tu orden por {Money(o.Total)}.</p>
<p style='color:#8b8b8b;font-size:12px;margin-top:16px'>Orden {o.Id}</p>";
}
