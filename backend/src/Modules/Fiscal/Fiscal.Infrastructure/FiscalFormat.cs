using System.Globalization;

namespace Fiscal.Infrastructure;

/// <summary>Formatos numéricos del contrato WSFE / PDF (decimal invariante "0.00").</summary>
internal static class FiscalFormat
{
    public static string Dec(decimal v) => v.ToString("0.00", CultureInfo.InvariantCulture);
}
