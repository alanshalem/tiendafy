using Fiscal.Core.Domain;

namespace UnitTests.Fiscal;

public class ComprobanteBuilderTests
{
    private static readonly Receptor ConsumidorFinal =
        new(DocTipo.ConsumidorFinal, 0, CondicionIvaReceptor.ConsumidorFinal);
    private static readonly Receptor Empresa =
        new(DocTipo.Cuit, 30123456789, CondicionIvaReceptor.ResponsableInscripto);

    [Fact]
    public void Monotributo_EmitsFacturaC_NoIva()
    {
        var d = ComprobanteBuilder.Build(FiscalCondition.Monotributo, ConsumidorFinal, 10000).Value; // $100

        Assert.Equal(CbteTipo.FacturaC, d.CbteTipo);
        Assert.Equal(100m, d.ImpNeto);   // ImpNeto = subtotal (H15)
        Assert.Equal(100m, d.ImpTotal);  // ImpTotal = ImpNeto + ImpTrib
        Assert.Equal(0m, d.ImpIVA);
        Assert.Empty(d.Iva);             // sin array Iva (error 10071 si se envía)
    }

    [Fact]
    public void ResponsableInscripto_ConsumidorFinal_EmitsFacturaB_IvaDesarmado()
    {
        var d = ComprobanteBuilder.Build(FiscalCondition.ResponsableInscripto, ConsumidorFinal, 12100).Value; // $121

        Assert.Equal(CbteTipo.FacturaB, d.CbteTipo);
        Assert.Equal(100m, d.ImpNeto);   // 121 / 1.21
        Assert.Equal(21m, d.ImpIVA);
        Assert.Equal(121m, d.ImpTotal);
        var line = Assert.Single(d.Iva);
        Assert.Equal(IvaId.Iva21, line.Id);
        Assert.Equal(100m, line.BaseImp);
        Assert.Equal(21m, line.Importe);
    }

    [Fact]
    public void ResponsableInscripto_ConCuit_EmitsFacturaA()
    {
        var d = ComprobanteBuilder.Build(FiscalCondition.ResponsableInscripto, Empresa, 12100).Value;
        Assert.Equal(CbteTipo.FacturaA, d.CbteTipo);
    }

    [Theory]
    [InlineData(FiscalCondition.Monotributo, false, CbteTipo.FacturaC)]
    [InlineData(FiscalCondition.Monotributo, true, CbteTipo.NotaCreditoC)]
    [InlineData(FiscalCondition.ResponsableInscripto, true, CbteTipo.NotaCreditoB)]
    public void CreditNote_MapsToNc(FiscalCondition emisor, bool nc, CbteTipo expected)
    {
        var d = ComprobanteBuilder.Build(emisor, ConsumidorFinal, 10000, creditNote: nc).Value;
        Assert.Equal(expected, d.CbteTipo);
    }

    [Theory]
    [InlineData(10000)]   // 100.00
    [InlineData(12100)]   // 121.00
    [InlineData(999)]     // 9.99 (redondeo feo)
    [InlineData(3705000)] // 37.050,00
    public void ControlEquation_Holds_And_RoundingExact(long grossMinor)
    {
        var d = ComprobanteBuilder.Build(FiscalCondition.ResponsableInscripto, ConsumidorFinal, grossMinor).Value;

        // H10: ImpTotal = ImpTotConc + ImpOpEx + ImpNeto + ImpIVA + ImpTrib
        Assert.Equal(d.ImpTotal, d.ImpTotConc + d.ImpOpEx + d.ImpNeto + d.ImpIVA + d.ImpTrib);
        // neto + iva == total, al centavo (sin drift de redondeo)
        Assert.Equal(grossMinor / 100m, d.ImpNeto + d.ImpIVA);
        // El IVA desarmado cae dentro de la tolerancia de ARCA.
        Assert.True(ComprobanteBuilder.IvaWithinTolerance(d.ImpNeto, d.ImpIVA, 21m, 1));
    }

    [Fact]
    public void NonPositiveTotal_Fails()
    {
        Assert.True(ComprobanteBuilder.Build(FiscalCondition.Monotributo, ConsumidorFinal, 0).IsFailure);
        Assert.True(ComprobanteBuilder.Build(FiscalCondition.ResponsableInscripto, ConsumidorFinal, -100).IsFailure);
    }

    [Fact]
    public void Currency_IsArcaPesCode()
    {
        var d = ComprobanteBuilder.Build(FiscalCondition.Monotributo, ConsumidorFinal, 10000).Value;
        Assert.Equal("PES", d.Currency); // no "ARS"
    }
}

public class ReceptorResolverTests
{
    [Fact]
    public void CuitDeSociedad_ResuelveResponsableInscripto()
    {
        // Prefijo 30: persona jurídica. Una sociedad es Responsable Inscripto
        // salvo rareza, y eso sí se puede deducir del número.
        var r = ReceptorResolver.Resolve("30-71234567-1", grossMinorUnits: 100, thresholdMinorUnits: 1000);
        Assert.Equal(DocTipo.Cuit, r.DocTipo);
        Assert.Equal(30712345671, r.DocNro);
        Assert.Equal(CondicionIvaReceptor.ResponsableInscripto, r.Condicion);
    }

    [Fact]
    public void CuilDePersona_NoSeFacturaComoResponsableInscripto()
    {
        // El bug que esto cierra: un CUIL tiene la misma forma que un CUIT, así
        // que el comprador escribía el suyo y se le emitía una Factura A con
        // IVA discriminado que no le corresponde. El número se conserva —es su
        // documento— pero la condición no se inventa.
        var r = ReceptorResolver.Resolve("20-12345678-6", grossMinorUnits: 100, thresholdMinorUnits: 1000);
        Assert.Equal(DocTipo.Cuit, r.DocTipo);
        Assert.Equal(20123456786, r.DocNro);
        Assert.Equal(CondicionIvaReceptor.ConsumidorFinal, r.Condicion);
    }

    [Theory]
    [InlineData("27-12345678-4")] // persona física
    [InlineData("23-12345678-9")] // persona física
    public void NingunPrefijoDePersonaFisica_TerminaEnFacturaA(string doc)
    {
        var r = ReceptorResolver.Resolve(doc, grossMinorUnits: 100, thresholdMinorUnits: 1000);
        Assert.NotEqual(CondicionIvaReceptor.ResponsableInscripto, r.Condicion);
    }

    [Fact]
    public void La_condicion_declarada_le_gana_a_la_inferencia()
    {
        // Un monotributista con CUIT de sociedad, o un RI persona física: el
        // dato cargado tiene que poder corregir lo que el número sugiere.
        var monotributista = ReceptorResolver.Resolve(
            "30-71234567-1", 100, 1000, CondicionIvaReceptor.Monotributo);
        Assert.Equal(CondicionIvaReceptor.Monotributo, monotributista.Condicion);

        var inscripto = ReceptorResolver.Resolve(
            "20-12345678-6", 100, 1000, CondicionIvaReceptor.ResponsableInscripto);
        Assert.Equal(CondicionIvaReceptor.ResponsableInscripto, inscripto.Condicion);
    }

    [Fact]
    public void Dni_ResolvesConsumidorIdentificado()
    {
        var r = ReceptorResolver.Resolve("30111222", grossMinorUnits: 100, thresholdMinorUnits: 1000);
        Assert.Equal(DocTipo.Dni, r.DocTipo);
        Assert.Equal(30111222, r.DocNro);
        Assert.Equal(CondicionIvaReceptor.ConsumidorFinal, r.Condicion);
    }

    [Fact]
    public void NoDoc_UnderThreshold_ConsumidorFinalAnonimo()
    {
        var r = ReceptorResolver.Resolve(null, grossMinorUnits: 500, thresholdMinorUnits: 1000);
        Assert.Equal(DocTipo.ConsumidorFinal, r.DocTipo);
        Assert.Equal(0, r.DocNro);
        Assert.Equal(CondicionIvaReceptor.ConsumidorFinal, r.Condicion);
    }

    [Fact]
    public void InvalidCuit_FallsBackToConsumidorFinal()
    {
        // 11 dígitos pero dígito verificador malo → no es CUIT.
        var r = ReceptorResolver.Resolve("20123456780", grossMinorUnits: 100, thresholdMinorUnits: 1000);
        Assert.Equal(DocTipo.ConsumidorFinal, r.DocTipo);
    }
}
