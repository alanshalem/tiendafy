using System.Text;
using Api.Purchasing;

namespace UnitTests.Api.Purchasing;

public sealed class InvoiceTokenEstimateTests
{
    [Fact]
    public void Cuenta_paginas_y_no_el_arbol()
    {
        var pdf = Encoding.Latin1.GetBytes("%PDF-1.4 << /Type /Pages /Count 2 >> << /Type /Page >> << /Type/Page >>");

        Assert.Equal(2, InvoiceTokenEstimate.PdfPages(pdf));
        Assert.Equal(9_100, InvoiceTokenEstimate.ForFile(pdf, "application/pdf", 300));
    }

    [Fact]
    public void Pdf_comprimido_usa_el_peso()
    {
        var pdf = new byte[250_000];
        Encoding.Latin1.GetBytes("%PDF").CopyTo(pdf, 0);

        Assert.Equal(3, InvoiceTokenEstimate.PdfPages(pdf));
    }

    [Fact]
    public void Imagen_cuenta_fijo() =>
        Assert.Equal(2_100, InvoiceTokenEstimate.ForFile(new byte[5_000_000], "image/png", 300));

    [Fact]
    public void La_correccion_vuelve_a_contar_el_archivo() =>
        Assert.Equal(9_600, InvoiceTokenEstimate.ForCorrection(9_100, 1_200, 300));

    [Fact]
    public void Texto_por_tres_hacia_arriba() =>
        Assert.Equal(101, InvoiceTokenEstimate.ForText(301));

    private static byte[] Deflate(byte[] data)
    {
        using var output = new MemoryStream();
        using (var z = new System.IO.Compression.ZLibStream(output, System.IO.Compression.CompressionLevel.Optimal, true))
            z.Write(data);
        return output.ToArray();
    }

    /// <summary>Un PDF 1.5 cuyas páginas viven dentro de un object stream comprimido, como los que arma Word.</summary>
    private static byte[] PdfWithObjectStream(int pages, byte[]? payload = null)
    {
        var body = payload ?? Encoding.Latin1.GetBytes(string.Concat(Enumerable.Repeat("<< /Type /Page /Parent 2 0 R >> ", pages)));
        var compressed = Deflate(body);
        var head = Encoding.Latin1.GetBytes(
            $"%PDF-1.5\n1 0 obj\n<< /Type /ObjStm /N {pages} /First 10 /Filter /FlateDecode /Length {compressed.Length} >>\nstream\n");
        var tail = Encoding.Latin1.GetBytes("\nendstream\nendobj\n<< /Type /Pages /Count 40 >>\n%%EOF");
        return [.. head, .. compressed, .. tail];
    }

    [Fact]
    public void Cuenta_las_paginas_dentro_de_un_object_stream()
    {
        var pdf = PdfWithObjectStream(40);

        // Pesa menos de 100 KB: por peso daría 1.
        Assert.True(pdf.Length < InvoiceTokenEstimate.BytesPerPageFallback);
        Assert.Equal(40, InvoiceTokenEstimate.PdfPages(pdf));
    }

    [Fact]
    public void Suma_las_paginas_sueltas_y_las_del_object_stream()
    {
        var plain = Encoding.Latin1.GetBytes("<< /Type /Page >> << /Type /Page >>\n");
        var pdf = (byte[])[.. plain, .. PdfWithObjectStream(3)];

        Assert.Equal(5, InvoiceTokenEstimate.PdfPages(pdf));
    }

    [Fact]
    public void Un_object_stream_que_infla_de_mas_no_agota_la_memoria()
    {
        // 64 MB de ceros comprimen a unos 64 KB: se corta en el tope y sigue siendo un conteo valido.
        var bomb = PdfWithObjectStream(1, new byte[64 * 1024 * 1024]);

        Assert.True(bomb.Length < InvoiceScanner.MaxBytes);
        Assert.True(InvoiceTokenEstimate.PdfPages(bomb) >= 1);
    }

    [Fact]
    public void Un_stream_corrupto_no_tira()
    {
        var pdf = Encoding.Latin1.GetBytes("%PDF-1.5\n<< /Type /ObjStm /Filter /FlateDecode >>\nstream\nesto no es zlib\nendstream\n");

        Assert.Equal(1, InvoiceTokenEstimate.PdfPages(pdf));
    }
}
