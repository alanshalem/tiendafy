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

        var cbteTipo = ResolveCbteTipo(emisor, receptor, creditNote);
        var gross = grossMinorUnits / 100m;

        if (emisor == FiscalCondition.Monotributo)
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
