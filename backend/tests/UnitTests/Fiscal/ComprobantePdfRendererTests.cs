using System.Text;
using Fiscal.Core.Abstractions;
using Fiscal.Infrastructure.Pdf;

namespace UnitTests.Fiscal;

public class ComprobantePdfRendererTests
{
    private static ComprobantePdfData Sample(decimal iva = 21m) => new(
        EmisorCuit: 30123456789,
        EmisorName: "Tienda Demo SRL",
        EmisorConditionLabel: "Responsable Inscripto",
        Letra: "B", TipoCmp: 6, TipoLabel: "Factura B", PtoVta: 1, Number: 42,
        Fecha: new DateOnly(2026, 7, 27), Cae: "75123456789012", CaeVto: new DateOnly(2026, 8, 6),
        TipoDocRec: 99, NroDocRec: 0, ReceptorDocLabel: "Consumidor Final", ReceptorConditionLabel: "Consumidor Final",
        ImpNeto: 100m, ImpIVA: iva, ImpTotal: 100m + iva, Currency: "PES",
        Items: [new ComprobantePdfItem("Remera azul · Talle M", 1, 100m + iva)]);

    [Fact]
    public void Render_ProducesPdf()
    {
        var pdf = new ComprobantePdfRenderer().Render(Sample());
        Assert.NotNull(pdf);
        Assert.True(pdf.Length > 1000);
        Assert.Equal("%PDF", Encoding.ASCII.GetString(pdf, 0, 4)); // firma de archivo PDF
    }

    [Fact]
    public void Render_MonotributoWithoutIva_StillWorks()
    {
        var pdf = new ComprobantePdfRenderer().Render(Sample(iva: 0m));
        Assert.Equal("%PDF", Encoding.ASCII.GetString(pdf, 0, 4));
    }
}
