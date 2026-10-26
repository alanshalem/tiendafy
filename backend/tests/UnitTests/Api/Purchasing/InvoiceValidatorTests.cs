using Api.Purchasing;

namespace UnitTests.Api.Purchasing;

public sealed class InvoiceValidatorTests
{
    private static readonly DateOnly Today = new(2026, 10, 25);

    private static ScannedInvoiceLine Line(decimal q, decimal p) => new("Mancuerna", null, q, p);

    private static ScannedInvoice Valid() => new(
        "Importadora del Sur SRL", "30712345671", "A", "0001-00001234", new DateTime(2026, 10, 5, 0, 0, 0, DateTimeKind.Utc),
        "ARS", 500_000m, 105_000m, null, 605_000m, [Line(100, 5_000)], "alta", []);

    private static IReadOnlyList<InvoiceIssue> Check(ScannedInvoice invoice) => InvoiceValidator.Validate(invoice, Today);

    [Fact]
    public void Una_factura_que_cierra_no_tiene_controles() => Assert.Empty(Check(Valid()));

    [Fact]
    public void Lineas_que_no_suman_el_neto()
    {
        var issue = Assert.Single(Check(Valid() with { Lines = [Line(100, 4_000)] }));

        Assert.Equal("Invoice.LinesVsNet", issue.Code);
        Assert.Contains("400000.00", issue.ForModel);
        Assert.Contains("500000.00", issue.ForModel);
        Assert.Contains("400.000,00", issue.Message);
    }

    [Fact]
    public void Lineas_en_el_borde_de_la_tolerancia()
    {
        var invoice = Valid() with { NetAmount = 100_000m, VatAmount = 21_000m, TotalAmount = 121_000m };

        Assert.Empty(Check(invoice with { Lines = [Line(1, 100_100m)] }));
        Assert.Equal("Invoice.LinesVsNet", Assert.Single(Check(invoice with { Lines = [Line(1, 100_100.01m)] })).Code);
    }

    [Fact]
    public void Tres_lineas_con_redondeo_pasan()
    {
        var invoice = Valid() with
        {
            NetAmount = 100_000m,
            VatAmount = 21_000m,
            TotalAmount = 121_000m,
            Lines = [Line(1, 33_333.33m), Line(1, 33_333.33m), Line(1, 33_333.33m)],
        };

        Assert.Empty(Check(invoice));
    }

    [Fact]
    public void Factura_B_compara_las_lineas_con_el_total()
    {
        var invoice = Valid() with
        {
            InvoiceType = "B",
            NetAmount = null,
            VatAmount = null,
            TotalAmount = 50_000m,
            Lines = [Line(2, 25_000)],
        };

        Assert.Empty(Check(invoice));
        Assert.Equal("Invoice.LinesVsNet", Assert.Single(Check(invoice with { Lines = [Line(2, 20_000)] })).Code);
    }

    [Fact]
    public void Neto_mas_IVA_contra_el_total()
    {
        var invoice = Valid() with { NetAmount = 1_000_000.50m, VatAmount = 210_000.11m, Lines = [] };

        Assert.Equal("Invoice.NetVatVsTotal", Assert.Single(Check(invoice with { TotalAmount = 1_210_000.64m })).Code);
        Assert.Empty(Check(invoice with { TotalAmount = 1_210_000.63m }));
    }

    [Fact]
    public void Otros_importes_cierran_el_total()
    {
        var invoice = Valid() with
        {
            NetAmount = 100_000m,
            VatAmount = 21_000m,
            OtherAmount = 3_000m,
            TotalAmount = 124_000m,
            Lines = [],
        };

        Assert.Empty(Check(invoice));
        Assert.Equal("Invoice.NetVatVsTotal", Assert.Single(Check(invoice with { OtherAmount = null })).Code);
    }

    [Fact]
    public void CUIT_con_digito_verificador_incorrecto()
    {
        Assert.Equal("Invoice.CuitCheckDigit", Assert.Single(Check(Valid() with { SupplierTaxId = "30712345678" })).Code);
        Assert.Empty(Check(Valid() with { SupplierTaxId = "30712345671" }));
    }

    [Fact]
    public void Fecha_futura()
    {
        Assert.Equal("Invoice.FutureDate",
            Assert.Single(Check(Valid() with { InvoiceDate = new DateTime(2026, 10, 26, 0, 0, 0, DateTimeKind.Utc) })).Code);
        Assert.Empty(Check(Valid() with { InvoiceDate = new DateTime(2026, 10, 25, 0, 0, 0, DateTimeKind.Utc) }));
    }

    [Fact]
    public void Moneda_desconocida()
    {
        Assert.Equal("Invoice.UnknownCurrency", Assert.Single(Check(Valid() with { Currency = "BRL" })).Code);
        Assert.Empty(Check(Valid() with { Currency = "USD" }));
        Assert.Empty(Check(Valid() with { Currency = "EUR" }));
    }

    [Fact]
    public void Lineas_incompletas_no_se_suman()
    {
        var invoice = Valid() with { Lines = [new ScannedInvoiceLine("Mancuerna", null, null, 5_000m), Line(1, 10m)] };

        Assert.Empty(Check(invoice));
    }
}
