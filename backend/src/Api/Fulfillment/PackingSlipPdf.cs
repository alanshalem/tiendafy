using Orders.Core.Domain;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using SharedKernel.Common;

namespace Api.Fulfillment;

/// <summary>
/// Remitos de preparación: una hoja por pedido con lo que va adentro, de qué
/// estante sale y un casillero por línea para tildar al armar la caja.
///
/// <para>
/// El QR de la esquina es el id de la venta: en Despacho, escanearlo abre ese
/// pedido para "despachar escaneando" sin buscarlo a mano. Sin precios a
/// propósito: el remito viaja dentro de la caja y puede ser un regalo.
/// </para>
/// </summary>
public static class PackingSlipPdf
{
    public sealed record Slip(Order Order, IReadOnlyDictionary<Guid, string?> Locations);

    public static byte[] Render(string storeName, IReadOnlyList<Slip> slips)
    {
        QuestPDF.Settings.License = LicenseType.Community;

        return Document.Create(doc =>
        {
            foreach (var slip in slips)
            {
                var o = slip.Order;
                doc.Page(page =>
                {
                    page.Size(PageSizes.A4);
                    page.Margin(28);
                    page.DefaultTextStyle(t => t.FontSize(10));

                    page.Header().Row(row =>
                    {
                        row.RelativeItem().Column(col =>
                        {
                            col.Item().Text(storeName).FontSize(16).Bold();
                            col.Item().Text($"Pedido {FulfillmentService.Number(o)}").FontSize(13).SemiBold();
                            col.Item().Text($"Fecha: {ArgentinaTime.ToLocal(o.PaidAtUtc ?? o.CreatedAtUtc):dd/MM/yyyy HH:mm}")
                                .FontColor(Colors.Grey.Darken1);
                        });
                        row.ConstantItem(84).Svg(Api.Import.VariantLabelsPdf.QrSvg(o.Id.ToString()));
                    });

                    page.Content().PaddingTop(14).Column(col =>
                    {
                        col.Spacing(10);
                        col.Item().Border(0.5f).BorderColor(Colors.Grey.Lighten1).Padding(8).Column(to =>
                        {
                            to.Item().Text(o.IsPickup ? "Retira en el local" : "Enviar a").FontSize(8)
                                .FontColor(Colors.Grey.Darken1);
                            to.Item().Text(string.IsNullOrWhiteSpace(o.BuyerName) ? o.BuyerEmail : o.BuyerName).SemiBold();
                            if (!string.IsNullOrWhiteSpace(o.ShippingAddress)) to.Item().Text(o.ShippingAddress);
                            if (!string.IsNullOrWhiteSpace(o.BuyerPhone)) to.Item().Text($"Tel.: {o.BuyerPhone}");
                            if (!string.IsNullOrWhiteSpace(o.ShippingMethodName))
                                to.Item().Text($"Envío: {o.ShippingMethodName}").FontColor(Colors.Grey.Darken2);
                        });

                        col.Item().Table(table =>
                        {
                            table.ColumnsDefinition(c =>
                            {
                                c.ConstantColumn(22);
                                c.RelativeColumn(5);
                                c.RelativeColumn(2);
                                c.RelativeColumn(2);
                                c.ConstantColumn(44);
                            });
                            table.Header(h =>
                            {
                                foreach (var title in new[] { "", "Producto", "SKU", "Ubicación", "Cant." })
                                    h.Cell().BorderBottom(1).BorderColor(Colors.Grey.Darken1).PaddingVertical(4)
                                        .Text(title).FontSize(8).SemiBold();
                            });
                            foreach (var item in o.Items)
                            {
                                table.Cell().PaddingVertical(5).Width(11).Height(11).Border(1).BorderColor(Colors.Grey.Darken2);
                                table.Cell().PaddingVertical(4).Text(string.IsNullOrWhiteSpace(item.VariantDescription)
                                    || item.VariantDescription == "Única"
                                    ? item.ProductName
                                    : $"{item.ProductName} · {item.VariantDescription}");
                                table.Cell().PaddingVertical(4).Text(item.Sku).FontSize(9);
                                table.Cell().PaddingVertical(4).Text(slip.Locations.GetValueOrDefault(item.VariantId) ?? "—").FontSize(9);
                                table.Cell().PaddingVertical(4).AlignRight().Text(item.Quantity.ToString()).SemiBold();
                            }
                        });

                        col.Item().AlignRight().Text($"{o.Items.Sum(i => i.Quantity)} unidades").SemiBold();
                        if (!string.IsNullOrWhiteSpace(o.Notes))
                            col.Item().Background(Colors.Grey.Lighten4).Padding(8).Text($"Nota del comprador: {o.Notes}");
                    });

                    page.Footer().AlignCenter().Text("Escaneá el QR en Despacho para preparar y despachar este pedido.")
                        .FontSize(8).FontColor(Colors.Grey.Darken1);
                });
            }
        }).GeneratePdf();
    }
}
