using System.Text;
using Net.Codecrete.QrCodeGenerator;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace Api.Import;

public sealed record VariantLabel(string ProductName, string VariantDescription, string Sku, string Code, long PriceMinor);

/// <summary>
/// Plancha A4 de etiquetas (3×8, ~70×36mm) con QR para el depósito: el QR
/// codifica el código de barras de la variante (o el SKU si no tiene) y lo lee
/// la cámara del celular en el Escáner del admin. Para productos que ya traen
/// EAN del proveedor no hace falta etiquetar: el escáner lee ese EAN directo.
/// </summary>
public static class VariantLabelsPdf
{
    public static byte[] Render(IReadOnlyList<VariantLabel> labels)
    {
        QuestPDF.Settings.License = LicenseType.Community;

        return Document.Create(doc => doc.Page(page =>
        {
            page.Size(PageSizes.A4);
            page.Margin(8);
            page.Content().Table(table =>
            {
                table.ColumnsDefinition(cols =>
                {
                    cols.RelativeColumn();
                    cols.RelativeColumn();
                    cols.RelativeColumn();
                });

                foreach (var label in labels)
                {
                    table.Cell().Height(100).Padding(4).Border(0.5f).BorderColor(Colors.Grey.Lighten2).Row(row =>
                    {
                        row.ConstantItem(80).Svg(QrSvg(label.Code));
                        row.RelativeItem().PaddingLeft(4).Column(col =>
                        {
                            col.Item().Text(Clip(label.ProductName, 44)).FontSize(8).SemiBold();
                            if (label.VariantDescription.Length > 0)
                                col.Item().Text(Clip(label.VariantDescription, 30)).FontSize(7);
                            col.Item().Text(label.Sku).FontSize(7).FontColor(Colors.Grey.Darken1);
                            col.Item().Text($"$ {label.PriceMinor / 100m:N0}").FontSize(9).Bold();
                        });
                    });
                }

                // Completar la última fila para que la tabla cierre pareja.
                var remainder = labels.Count % 3;
                if (remainder > 0)
                    for (var i = remainder; i < 3; i++)
                        table.Cell().Height(100);
            });
        })).GeneratePdf();
    }

    private static string Clip(string s, int max) => s.Length <= max ? s : s[..(max - 1)] + "…";

    /// <summary>QR como SVG (rects por módulo) — sin dependencias de imágenes.</summary>
    private static string QrSvg(string content)
    {
        var qr = QrCode.EncodeText(content, QrCode.Ecc.Medium);
        var size = qr.Size;
        const int border = 2;
        var total = size + border * 2;
        var sb = new StringBuilder();
        sb.Append($"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 {total} {total}\">");
        sb.Append($"<rect width=\"{total}\" height=\"{total}\" fill=\"#fff\"/>");
        for (var y = 0; y < size; y++)
            for (var x = 0; x < size; x++)
                if (qr.GetModule(x, y))
                    sb.Append($"<rect x=\"{x + border}\" y=\"{y + border}\" width=\"1\" height=\"1\" fill=\"#000\"/>");
        sb.Append("</svg>");
        return sb.ToString();
    }
}
