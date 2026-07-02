using SharedKernel.Common;

namespace Api;

/// <summary>
/// Proyecciones JSON compartidas por los endpoints. <see cref="MoneyJson"/> emite la
/// forma anónima { amount, currency } usada en respuestas de órdenes/checkout/stats.
/// DISTINTA de <c>MoneyDto</c>/<c>Money.ToDto()</c> (que emite { amountInMinorUnits, currency }).
/// </summary>
internal static class ApiJson
{
    public static object MoneyJson(Money m) => new { amount = m.AmountInMinorUnits, currency = m.Currency };
}
