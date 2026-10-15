using Fiscal.Core.Domain;

namespace UnitTests.Fiscal;

/// <summary>
/// La nota de crédito sale al mismo receptor y con la misma clase que la
/// factura que acredita. Antes se recalculaba desde el documento de la venta:
/// una A a un RI persona física (declarado a mano) salía con NC B, y una
/// factura con el documento corregido, con NC a otro comprador. ARCA rechaza
/// las dos.
/// </summary>
public class CreditNoteTests
{
    private static FiscalDocument Authorized(
        CbteTipo tipo, DocTipo docTipo, long docNro, CondicionIvaReceptor? condicion, int ptoVta = 3, long number = 41)
    {
        var doc = FiscalDocument.Draft(Guid.NewGuid(), Guid.NewGuid(), FiscalEnvironment.Homologacion,
            ptoVta, tipo, number, docTipo, docNro, 121m, 100m, 21m, condicion);
        doc.MarkAuthorized("75000000000041", DateTime.UtcNow.AddDays(10), null, "<req/>", "<res/>");
        return doc;
    }

    [Fact]
    public void Una_A_a_un_RI_persona_fisica_se_acredita_con_NC_A_al_mismo_CUIT()
    {
        // CUIT de persona física: sin la condición guardada, se inferiría
        // consumidor final y la NC saldría B.
        var original = Authorized(CbteTipo.FacturaA, DocTipo.Cuit, 20123456786, CondicionIvaReceptor.ResponsableInscripto);

        var nc = ComprobanteBuilder.BuildCreditNote(original, 12_100).Value;

        Assert.Equal(CbteTipo.NotaCreditoA, nc.CbteTipo);
        Assert.Equal(new Receptor(DocTipo.Cuit, 20123456786, CondicionIvaReceptor.ResponsableInscripto), nc.Receptor);
        Assert.Equal(21m, nc.ImpIVA);
        var asoc = Assert.Single(nc.CbtesAsoc);
        Assert.Equal(new CbteAsoc(CbteTipo.FacturaA, 3, 41), asoc);
    }

    [Fact]
    public void Una_B_se_acredita_con_NC_B_al_documento_de_la_factura()
    {
        var original = Authorized(CbteTipo.FacturaB, DocTipo.Dni, 30111222, CondicionIvaReceptor.ConsumidorFinal);

        var nc = ComprobanteBuilder.BuildCreditNote(original, 12_100).Value;

        Assert.Equal(CbteTipo.NotaCreditoB, nc.CbteTipo);
        Assert.Equal(new Receptor(DocTipo.Dni, 30111222, CondicionIvaReceptor.ConsumidorFinal), nc.Receptor);
        Assert.Equal(CbteTipo.FacturaB, Assert.Single(nc.CbtesAsoc).Tipo);
    }

    [Fact]
    public void Una_B_a_un_monotributista_conserva_la_condicion()
    {
        var original = Authorized(CbteTipo.FacturaB, DocTipo.Cuit, 20123456786, CondicionIvaReceptor.Monotributo);

        var nc = ComprobanteBuilder.BuildCreditNote(original, 12_100).Value;

        Assert.Equal(CbteTipo.NotaCreditoB, nc.CbteTipo);
        Assert.Equal(CondicionIvaReceptor.Monotributo, nc.Receptor.Condicion);
    }

    [Fact]
    public void Una_C_se_acredita_con_NC_C_sin_IVA()
    {
        var original = Authorized(CbteTipo.FacturaC, DocTipo.ConsumidorFinal, 0, CondicionIvaReceptor.ConsumidorFinal);

        var nc = ComprobanteBuilder.BuildCreditNote(original, 10_000).Value;

        Assert.Equal(CbteTipo.NotaCreditoC, nc.CbteTipo);
        Assert.Equal(DocTipo.ConsumidorFinal, nc.Receptor.DocTipo);
        Assert.Equal(100m, nc.ImpNeto);
        Assert.Equal(0m, nc.ImpIVA);
        Assert.Empty(nc.Iva); // clase C no lleva array Iva (10071)
        Assert.Equal(CbteTipo.FacturaC, Assert.Single(nc.CbtesAsoc).Tipo);
    }

    [Theory]
    [InlineData(CbteTipo.FacturaA, CondicionIvaReceptor.ResponsableInscripto)]
    [InlineData(CbteTipo.FacturaB, CondicionIvaReceptor.ConsumidorFinal)]
    [InlineData(CbteTipo.FacturaC, CondicionIvaReceptor.ConsumidorFinal)]
    public void Un_comprobante_viejo_sin_condicion_la_toma_de_la_clase(CbteTipo tipo, CondicionIvaReceptor esperada)
    {
        var original = Authorized(tipo, DocTipo.Cuit, 30123456781, condicion: null);

        Assert.Equal(esperada, ComprobanteBuilder.BuildCreditNote(original, 12_100).Value.Receptor.Condicion);
    }

    [Fact]
    public void Una_nota_de_credito_no_se_acredita()
    {
        var original = Authorized(CbteTipo.NotaCreditoB, DocTipo.ConsumidorFinal, 0, CondicionIvaReceptor.ConsumidorFinal);

        var r = ComprobanteBuilder.BuildCreditNote(original, 12_100);

        Assert.True(r.IsFailure);
        Assert.Equal("Comprobante.NotAnInvoice", r.Error.Code);
    }
}
