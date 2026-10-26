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
}
