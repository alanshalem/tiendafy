using SharedKernel.Common;

namespace Fiscal.Core.Domain;

/// <summary>
/// Arma el comprobante para WSFEv1 según la clase del emisor. En e-commerce los
/// precios se muestran CON IVA incluido (el comprador paga el precio final), así
/// que para Responsable Inscripto se "desarma" el IVA del total; para Monotributo
/// (clase C) no hay IVA (H15). El envío va al 21% junto con los productos
/// (decisión de negocio: alícuota única 21%).
/// </summary>
public static class ComprobanteBuilder
{
    private const decimal Iva21Rate = 0.21m;
    private const string PesoArca = "PES"; // código de moneda de ARCA (no "ARS")

    /// <param name="emisor">Condición del emisor (define A/B vs C).</param>
    /// <param name="receptor">Receptor ya resuelto (doc + condición IVA).</param>
    /// <param name="grossMinorUnits">Total a facturar (subtotal − descuento + envío), en centavos.</param>
    /// <param name="creditNote">true = nota de crédito (mismos montos, tipo NC).</param>
    public static Result<InvoiceDraft> Build(
        FiscalCondition emisor, Receptor receptor, long grossMinorUnits, bool creditNote = false)
    {
        if (grossMinorUnits <= 0)
            return Result.Failure<InvoiceDraft>(Error.Validation("Comprobante.NonPositive", "El total debe ser mayor a cero."));

        return Assemble(ResolveCbteTipo(emisor, receptor, creditNote), receptor, grossMinorUnits);
    }

    /// <summary>
    /// La nota de crédito de una factura autorizada: mismo receptor (tipo y
    /// número de documento, condición frente al IVA) y misma clase que la
    /// original, que va referenciada en CbtesAsoc. No se recalcula nada desde
    /// la venta: ARCA rechaza una NC cuya clase o receptor no coincide con el
    /// comprobante que acredita (las NC A solo asocian facturas A, las B a B, las
    /// C a C; 10123 si el receptor es otro).
    /// </summary>
    /// <param name="original">La factura que se acredita (A, B o C, autorizada).</param>
    /// <param name="grossMinorUnits">Monto a acreditar, en centavos.</param>
    public static Result<InvoiceDraft> BuildCreditNote(FiscalDocument original, long grossMinorUnits)
    {
        if (grossMinorUnits <= 0)
            return Result.Failure<InvoiceDraft>(Error.Validation("Comprobante.NonPositive", "El total debe ser mayor a cero."));

        CbteTipo? ncTipo = original.CbteTipo switch
        {
            CbteTipo.FacturaA => CbteTipo.NotaCreditoA,
            CbteTipo.FacturaB => CbteTipo.NotaCreditoB,
            CbteTipo.FacturaC => CbteTipo.NotaCreditoC,
            _ => null,
        };
        if (ncTipo is null)
            return Result.Failure<InvoiceDraft>(Error.Validation("Comprobante.NotAnInvoice",
                "Solo se puede acreditar una factura A, B o C."));

        return Assemble(ncTipo.Value, original.IssuedReceptor(), grossMinorUnits) with
        {
            CbtesAsoc = [new CbteAsoc(original.CbteTipo, original.PtoVta, original.Number)],
        };
    }

    /// <summary>Los importes según la clase del comprobante ya decidida.</summary>
    private static InvoiceDraft Assemble(CbteTipo cbteTipo, Receptor receptor, long grossMinorUnits)
    {
        var gross = grossMinorUnits / 100m;

        if (cbteTipo is CbteTipo.FacturaC or CbteTipo.NotaCreditoC or CbteTipo.NotaDebitoC)
        {
            // Clase C: ImpTotal = ImpNeto + ImpTrib; ImpNeto es el subtotal (no neto
            // gravado); sin array Iva (error 10071 si se envía), sin ImpIVA/OpEx/TotConc.
            return new InvoiceDraft(
                cbteTipo, Concepto.Productos, receptor, PesoArca,
                ImpTotal: gross, ImpTotConc: 0m, ImpNeto: gross, ImpOpEx: 0m,
                ImpIVA: 0m, ImpTrib: 0m, Iva: []);
        }

        // Responsable Inscripto (A/B), precio con IVA 21% incluido: desarmamos.
        // Redondeo exacto: neto redondeado a centavo, IVA = total − neto (así
        // neto + iva == total sin drift; cumple la tolerancia de ARCA H10).
        var netoMinor = (long)Math.Round(grossMinorUnits / (1m + Iva21Rate), MidpointRounding.AwayFromZero);
        var ivaMinor = grossMinorUnits - netoMinor;
        var neto = netoMinor / 100m;
        var iva = ivaMinor / 100m;

        return new InvoiceDraft(
            cbteTipo, Concepto.Productos, receptor, PesoArca,
            ImpTotal: gross, ImpTotConc: 0m, ImpNeto: neto, ImpOpEx: 0m,
            ImpIVA: iva, ImpTrib: 0m,
            Iva: [new IvaLine(IvaId.Iva21, neto, iva)]);
    }

    private static CbteTipo ResolveCbteTipo(FiscalCondition emisor, Receptor receptor, bool creditNote)
    {
        if (emisor == FiscalCondition.Monotributo)
            return creditNote ? CbteTipo.NotaCreditoC : CbteTipo.FacturaC;

        // RI: Factura A si el receptor es Responsable Inscripto (tiene CUIT), si no B.
        var isA = receptor.Condicion == CondicionIvaReceptor.ResponsableInscripto;
        return (isA, creditNote) switch
        {
            (true, false) => CbteTipo.FacturaA,
            (true, true) => CbteTipo.NotaCreditoA,
            (false, false) => CbteTipo.FacturaB,
            (false, true) => CbteTipo.NotaCreditoB,
        };
    }

    /// <summary>
    /// Regla de tolerancia de IVA de ARCA (validaciones 10023/10029, H10): error
    /// relativo ≤ 0.01% O error absoluto ≤ 0.01 × cantidad de alícuotas. Un epsilon
    /// fijo sería más estricto y rechazaría comprobantes que ARCA aceptaría.
    /// </summary>
    public static bool IvaWithinTolerance(decimal baseImp, decimal importe, decimal ratePercent, int alicuotasCount)
    {
        var expected = baseImp * ratePercent / 100m;
        var diff = Math.Abs(importe - expected);
        var relativeOk = expected != 0m && diff / expected <= 0.0001m;
        var absoluteOk = diff <= 0.01m * Math.Max(1, alicuotasCount);
        return relativeOk || absoluteOk;
    }
}
