using System.Text;
using Orders.Core.Domain;

namespace Api.Notifications;

/// <summary>Plantillas HTML simples para emails transaccionales de órdenes.</summary>
public static class OrderEmail
{
    private static string Money(SharedKernel.Common.Money m) => $"{m.Currency} {m.ToDecimal():N0}";

    private static string ItemsTable(Order o)
    {
        var sb = new StringBuilder("<table style='width:100%;border-collapse:collapse;font-size:14px'>");
        foreach (var i in o.Items)
        {
            sb.Append("<tr><td style='padding:4px 0'>")
              .Append(i.Quantity).Append("× ").Append(System.Net.WebUtility.HtmlEncode(i.ProductName));
            if (!string.IsNullOrWhiteSpace(i.VariantDescription))
                sb.Append(" · ").Append(System.Net.WebUtility.HtmlEncode(i.VariantDescription));
            sb.Append("</td><td style='padding:4px 0;text-align:right'>")
              .Append(Money(i.UnitPrice * i.Quantity)).Append("</td></tr>");
        }
        sb.Append("<tr><td style='padding-top:8px;font-weight:bold'>Total</td><td style='padding-top:8px;text-align:right;font-weight:bold'>")
          .Append(Money(o.Total)).Append("</td></tr></table>");
        return sb.ToString();
    }

    /// <summary>Variables para sustituir en las plantillas editables de email.</summary>
    public static IReadOnlyDictionary<string, string> OrderVars(Order o, string storeName) => new Dictionary<string, string>
    {
        ["store"] = storeName,
        ["order_id"] = o.Id.ToString(),
        ["total"] = Money(o.Total),
        ["items"] = ItemsTable(o),
        ["email"] = o.BuyerEmail,
    };

    public static string Refund(Order o) =>
        $@"<div style='font-family:sans-serif;max-width:520px;margin:auto'>
            <h2>Tu compra fue reembolsada</h2>
            <p>Procesamos el reembolso de tu orden por {Money(o.Total)}.</p>
            <p style='color:#888;font-size:12px;margin-top:16px'>Orden {o.Id}</p>
        </div>";
}
