using System.Globalization;
using System.Text;
using System.Text.Json;
using Fiscal.Core.Abstractions;
using QRCoder;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace Fiscal.Infrastructure.Pdf;

/// <summary>
/// Renderiza el PDF del comprobante con QuestPDF y embebe el QR de ARCA (RG 4892):
/// URL https://www.afip.gob.ar/fe/qr/?p=&lt;base64(json)&gt;. El PNG del QR se genera
/// con QRCoder (PngByteQRCode, sin System.Drawing → portable).
/// </summary>
public sealed class ComprobantePdfRenderer : IComprobantePdfRenderer
{
    private const string QrBaseUrl = "https://www.afip.gob.ar/fe/qr/?p=";

    static ComprobantePdfRenderer()
    {
        // Licencia Community de QuestPDF (gratis para uso general).
        QuestPDF.Settings.License = LicenseType.Community;
    }

    public byte[] Render(ComprobantePdfData d)
    {
        var qrPng = BuildQrPng(d);

        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(28);
                page.DefaultTextStyle(t => t.FontSize(9).FontColor(Colors.Black));

                page.Content().Column(col =>
                {
                    col.Spacing(10);
                    Header(col, d);
                    PartyBlock(col, d);
                    ItemsTable(col, d);
                    Totals(col, d);
                    Footer(col, d, qrPng);
                });
            });
        }).GeneratePdf();
    }

    private static void Header(ColumnDescriptor col, ComprobantePdfData d)
    {
        col.Item().Row(row =>
        {
            row.RelativeItem().Column(c =>
            {
                c.Item().Text(d.EmisorName).Bold().FontSize(14);
                c.Item().Text($"CUIT {Cuit(d.EmisorCuit)}");
                c.Item().Text(d.EmisorConditionLabel);
            });

            // Recuadro con la letra del comprobante (A/B/C), centrado.
            row.ConstantItem(70).Border(1).Padding(4).Column(c =>
            {
                c.Item().AlignCenter().Text(d.Letra).Bold().FontSize(26);
                c.Item().AlignCenter().Text($"Cód. {d.TipoCmp:00}").FontSize(8);
            });

            row.RelativeItem().AlignRight().Column(c =>
            {
                c.Item().AlignRight().Text(d.TipoLabel).Bold().FontSize(12);
                c.Item().AlignRight().Text($"Nº {d.PtoVta:0000}-{d.Number:00000000}");
                c.Item().AlignRight().Text($"Fecha: {d.Fecha:dd/MM/yyyy}");
            });
        });
    }

    private static void PartyBlock(ColumnDescriptor col, ComprobantePdfData d)
    {
        col.Item().BorderTop(1).PaddingTop(6).Column(c =>
        {
            c.Item().Text(t => { t.Span("Cliente: ").Bold(); t.Span(d.ReceptorDocLabel); });
            c.Item().Text(t => { t.Span("Condición IVA: ").Bold(); t.Span(d.ReceptorConditionLabel); });
        });
    }

    private static void ItemsTable(ColumnDescriptor col, ComprobantePdfData d)
    {
        if (d.Items.Count == 0) return;

        col.Item().Table(table =>
        {
            table.ColumnsDefinition(c =>
            {
                c.RelativeColumn(6);
                c.ConstantColumn(40);
                c.ConstantColumn(90);
            });

            table.Header(h =>
            {
                h.Cell().BorderBottom(1).Padding(3).Text("Detalle").Bold();
                h.Cell().BorderBottom(1).Padding(3).AlignRight().Text("Cant.").Bold();
                h.Cell().BorderBottom(1).Padding(3).AlignRight().Text("Importe").Bold();
            });

            foreach (var it in d.Items)
            {
                table.Cell().Padding(3).Text(it.Description);
                table.Cell().Padding(3).AlignRight().Text(it.Quantity.ToString());
                table.Cell().Padding(3).AlignRight().Text(Money(it.LineTotal, d.Currency));
            }
        });
    }

    private static void Totals(ColumnDescriptor col, ComprobantePdfData d)
    {
        col.Item().AlignRight().Column(c =>
        {
            // Monotributo (C) no discrimina IVA.
            if (d.ImpIVA > 0m)
            {
                c.Item().Text($"Neto gravado: {Money(d.ImpNeto, d.Currency)}");
                c.Item().Text($"IVA 21%: {Money(d.ImpIVA, d.Currency)}");
            }
            c.Item().Text($"TOTAL: {Money(d.ImpTotal, d.Currency)}").Bold().FontSize(12);
        });
    }

    private static void Footer(ColumnDescriptor col, ComprobantePdfData d, byte[] qrPng)
    {
        col.Item().BorderTop(1).PaddingTop(6).Row(row =>
        {
            row.ConstantItem(110).Image(qrPng);
            row.RelativeItem().PaddingLeft(10).AlignBottom().Column(c =>
            {
                c.Item().Text(t => { t.Span("CAE: ").Bold(); t.Span(d.Cae); });
                if (d.CaeVto is { } v) c.Item().Text($"Vto. CAE: {v:dd/MM/yyyy}");
                c.Item().PaddingTop(4).Text("Comprobante autorizado por ARCA (AFIP).").FontSize(8).FontColor(Colors.Grey.Darken1);
            });
        });
    }

    private static byte[] BuildQrPng(ComprobantePdfData d)
    {
        // JSON del QR según la especificación de ARCA (RG 4892), versión 1.
        var payload = new
        {
            ver = 1,
            fecha = d.Fecha.ToString("yyyy-MM-dd"),
            cuit = d.EmisorCuit,
            ptoVta = d.PtoVta,
            tipoCmp = d.TipoCmp,
            nroCmp = d.Number,
            importe = decimal.Parse(Dec(d.ImpTotal), CultureInfo.InvariantCulture),
            moneda = d.Currency,
            ctz = 1,
            tipoDocRec = d.TipoDocRec,
            nroDocRec = d.NroDocRec,
            tipoCodAut = "E",
            codAut = long.TryParse(d.Cae, out var cae) ? cae : 0L,
        };
        var json = JsonSerializer.Serialize(payload);
        var b64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(json));
        var url = QrBaseUrl + b64;

        using var gen = new QRCodeGenerator();
        using var data = gen.CreateQrCode(url, QRCodeGenerator.ECCLevel.M);
        return new PngByteQRCode(data).GetGraphic(20);
    }

    private static string Cuit(long cuit)
    {
        var s = cuit.ToString("00000000000");
        return $"{s[..2]}-{s.Substring(2, 8)}-{s[10..]}";
    }

    private static string Dec(decimal v) => v.ToString("0.00", CultureInfo.InvariantCulture);
    private static string Money(decimal v, string currency) =>
        (currency == "PES" ? "$ " : currency + " ") + v.ToString("N2", CultureInfo.GetCultureInfo("es-AR"));
}
