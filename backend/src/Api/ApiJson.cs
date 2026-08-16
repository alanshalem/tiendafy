using System.Text.Json;
using SharedKernel.Common;

namespace Api;

/// <summary>
/// Proyecciones y opciones JSON compartidas por los endpoints. <see cref="MoneyJson"/> emite la
/// forma anónima { amount, currency } usada en respuestas de órdenes/checkout/stats.
/// DISTINTA de <c>MoneyDto</c>/<c>Money.ToDto()</c> (que emite { amountInMinorUnits, currency }).
/// </summary>
internal static class ApiJson
{
    public static object MoneyJson(Money m) => new { amount = m.AmountInMinorUnits, currency = m.Currency };

    /// <summary>
    /// Opciones Web compartidas. Varios módulos ESCRIBEN blobs (ej. items de una
    /// venta de ML) y otros los LEEN: si escritor y lector no usan exactamente
    /// las mismas opciones, la deserialización devuelve defaults en silencio (ya
    /// pasó con las cantidades de items de ML en 0). Un único singleton evita el drift.
    /// </summary>
    public static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);
}
