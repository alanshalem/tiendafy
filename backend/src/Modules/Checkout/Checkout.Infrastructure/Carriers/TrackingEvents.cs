using System.Globalization;

namespace Checkout.Infrastructure.Carriers;

/// <summary>
/// Ordena el historial de seguimiento de un carrier. Ni Zipnova ni MiCorreo
/// documentan en qué orden vienen los eventos, así que no se supone ninguno:
/// se ordenan por su fecha.
/// </summary>
public static class TrackingEvents
{
    /// <summary>
    /// Fechas día-mes-año que se prueban antes que el parseo general: con
    /// cultura invariante, "11-10-2026" se leería 10 de noviembre.
    /// </summary>
    private static readonly string[] DayFirst =
        ["dd-MM-yyyy HH:mm", "dd-MM-yyyy HH:mm:ss", "dd/MM/yyyy HH:mm", "dd/MM/yyyy HH:mm:ss", "dd-MM-yyyy", "dd/MM/yyyy"];

    /// <summary>
    /// Del más nuevo al más viejo. Los eventos sin fecha legible van al final;
    /// a igual fecha, se respeta el orden en que llegaron.
    /// </summary>
    public static IReadOnlyList<T> NewestFirst<T>(IEnumerable<T> events, Func<T, string?> date) =>
        [.. events
            .Select((e, i) => (Event: e, Index: i, At: ParseDate(date(e))))
            .OrderByDescending(x => x.At.HasValue)
            .ThenByDescending(x => x.At)
            .ThenBy(x => x.Index)
            .Select(x => x.Event)];

    /// <summary>
    /// ISO 8601, "aaaa-mm-dd hh:mm:ss" o "dd-mm-aaaa hh:mm". Sin zona se toma
    /// como UTC: todos los eventos de un envío vienen igual, así que el orden
    /// no cambia.
    /// </summary>
    private static DateTimeOffset? ParseDate(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var text = raw.Trim();
        if (DateTimeOffset.TryParseExact(text, DayFirst, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var dayFirst))
            return dayFirst;
        return DateTimeOffset.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var at)
            ? at
            : null;
    }
}
