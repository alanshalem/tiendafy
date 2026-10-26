using System.Globalization;
using Fiscal.Core.Domain;
using SharedKernel.Common;

namespace Api.Purchasing;

/// <summary>
/// Un control que la factura leída no pasó. <paramref name="Message"/> es para la persona (formato
/// argentino); <paramref name="ForModel"/> es para la corrección (punto decimal y sin miles, el mismo
/// formato que le pedimos al modelo).
/// </summary>
public sealed record InvoiceIssue(string Code, string Message, string ForModel);

/// <summary>
/// Los controles en código de una factura leída: las cuentas tienen que cerrar, el CUIT tiene que ser
/// válido, la fecha no puede ser futura y la moneda tiene que ser una conocida. El validador solo
/// informa: nunca arregla un número.
/// </summary>
public static class InvoiceValidator
{
    /// <summary>Neto + IVA + otros contra el total: cada alícuota se redondea al centavo.</summary>
    public const decimal TotalTolerance = 0.02m;

    /// <summary>Un centavo por línea...</summary>
    public const decimal LinesPerLineTolerance = 0.01m;

    /// <summary>...o el 0,1 % de la base, lo que sea mayor.</summary>
    public const decimal LinesRelativeTolerance = 0.001m;

    public static readonly IReadOnlySet<string> KnownCurrencies = new HashSet<string>(["ARS", "USD", "EUR"]);

    public static IReadOnlyList<InvoiceIssue> Validate(ScannedInvoice invoice, DateOnly todayAr)
    {
        var issues = new List<InvoiceIssue>();

        // La suma de las líneas contra la base (el neto; sin neto, que es la factura B o C, el total).
        // Solo con todas las líneas completas: sumar una línea a medias daría un falso "no cierra".
        if (invoice.Lines.Count > 0 && invoice.Lines.All(l => l.Quantity is not null && l.UnitPrice is not null))
        {
            var (baseAmount, baseField, baseLabel) = invoice.NetAmount is { } net
                ? (net, "netAmount", "el neto leído")
                : (invoice.TotalAmount, "totalAmount", "el total leído");
            if (baseAmount is { } expected)
            {
                var sum = invoice.Lines.Sum(l => Math.Round(l.Quantity!.Value * l.UnitPrice!.Value, 2, MidpointRounding.AwayFromZero));
                var tolerance = Math.Max(LinesPerLineTolerance * invoice.Lines.Count, LinesRelativeTolerance * Math.Abs(expected));
                if (Math.Abs(sum - expected) > tolerance)
                    issues.Add(new InvoiceIssue(
                        "Invoice.LinesVsNet",
                        $"Las líneas suman {Show(sum)} y {baseLabel} es {Show(expected)}.",
                        $"La suma de cantidad × precio unitario de las líneas da {Raw(sum)}, pero {baseField} es {Raw(expected)}."));
            }
        }

        if (invoice is { NetAmount: { } n, VatAmount: { } v, TotalAmount: { } total })
        {
            var other = invoice.OtherAmount ?? 0m;
            var sum = n + v + other;
            if (Math.Abs(sum - total) > TotalTolerance)
                issues.Add(new InvoiceIssue(
                    "Invoice.NetVatVsTotal",
                    $"El neto, el IVA y otros importes suman {Show(sum)} y el total leído es {Show(total)}.",
                    $"netAmount + vatAmount + otherAmount da {Raw(sum)}, pero totalAmount es {Raw(total)}."));
        }

        if (invoice.SupplierTaxId is not null && Cuit.Create(invoice.SupplierTaxId).IsFailure)
            issues.Add(new InvoiceIssue(
                "Invoice.CuitCheckDigit",
                $"El CUIT leído ({invoice.SupplierTaxId}) no tiene un dígito verificador válido.",
                $"supplierTaxId {invoice.SupplierTaxId} no pasa el dígito verificador del CUIT."));

        if (invoice.InvoiceDate is { } date && DateOnly.FromDateTime(date) > todayAr)
            issues.Add(new InvoiceIssue(
                "Invoice.FutureDate",
                $"La fecha leída ({date:dd/MM/yyyy}) es posterior a hoy.",
                $"invoiceDate {date:yyyy-MM-dd} es posterior a hoy ({todayAr:yyyy-MM-dd})."));

        if (!KnownCurrencies.Contains(invoice.Currency))
            issues.Add(new InvoiceIssue(
                "Invoice.UnknownCurrency",
                $"La moneda leída ({invoice.Currency}) no es una de las conocidas (ARS, USD, EUR).",
                $"currency {invoice.Currency} no es una de ARS, USD o EUR."));

        return issues;
    }

    private static string Show(decimal value) => ArgentineNumbers.Number(value, 2);

    private static string Raw(decimal value) => value.ToString("0.00", CultureInfo.InvariantCulture);
}
