using System.Globalization;
using SharedKernel.Common;

namespace Api.Stats;

/// <summary>
/// Período de un reporte: días completos de Argentina, de <see cref="From"/> a
/// <see cref="To"/> inclusive, con tope de <see cref="MaxDays"/>. Es el único
/// lugar donde se ordena, se recorta y se pasa a UTC; lo usan los reportes del
/// panel y el asistente.
/// </summary>
public sealed record StatsPeriod(DateOnly From, DateOnly To, DateTime SinceUtc, DateTime UntilUtc, bool Clamped)
{
    public const int MaxDays = 366;

    /// <summary>Cantidad de días del período, ambos extremos incluidos.</summary>
    public int Days => To.DayNumber - From.DayNumber + 1;

    /// <summary>El período para decirlo en una frase, en formato argentino.</summary>
    public string Text => From == To
        ? $"el {Format(From)}"
        : $"del {Format(From)} al {Format(To)}";

    /// <summary>Ordena las fechas y recorta a <see cref="MaxDays"/> quedándose con las últimas.</summary>
    public static StatsPeriod FromDays(DateOnly from, DateOnly to)
    {
        if (to < from) (from, to) = (to, from);
        var clamped = to.DayNumber - from.DayNumber + 1 > MaxDays;
        if (clamped) from = to.AddDays(1 - MaxDays);
        return new StatsPeriod(
            from, to,
            ArgentinaTime.StartOfDayUtc(from),
            ArgentinaTime.StartOfDayUtc(to.AddDays(1)),
            clamped);
    }

    /// <summary>
    /// Arma el período desde fechas AAAA-MM-DD. Sin <paramref name="desde"/>:
    /// los últimos <paramref name="defaultDays"/> días hasta <paramref name="hasta"/>
    /// (o hoy). Una fecha futura se corrige a <paramref name="today"/>.
    /// <paramref name="today"/> llega de afuera para no leer el reloj.
    /// </summary>
    public static Result<StatsPeriod> Parse(string? desde, string? hasta, DateOnly today, int defaultDays = 30)
    {
        var to = today;
        if (!string.IsNullOrWhiteSpace(hasta))
        {
            if (!TryParseDate(hasta, out to)) return Result.Failure<StatsPeriod>(BadDate());
            if (to > today) to = today;
        }

        DateOnly from;
        if (string.IsNullOrWhiteSpace(desde))
            from = to.AddDays(1 - Math.Clamp(defaultDays, 1, MaxDays));
        else if (!TryParseDate(desde, out from))
            return Result.Failure<StatsPeriod>(BadDate());

        return FromDays(from, to);
    }

    private static bool TryParseDate(string value, out DateOnly date) =>
        DateOnly.TryParseExact(value.Trim(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out date);

    private static Error BadDate() =>
        Error.Validation("Assistant.BadDate", "Fecha inválida: usá AAAA-MM-DD.");

    private static string Format(DateOnly d) => d.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
}

/// <summary>
/// Los helpers de rango de las estadísticas, movidos tal cual desde
/// <c>StatsEndpoints</c>: los endpoints del panel siguen respondiendo igual.
/// </summary>
public static class StatsRanges
{
    /// <summary>
    /// El día de Argentina de un instante, para las series diarias. Medianoche
    /// con Kind Utc a propósito: el JSON sale igual que antes
    /// ("2026-10-15T00:00:00Z") y el panel lee solo la parte de la fecha.
    /// </summary>
    public static DateTime LocalDay(DateTime utc) =>
        DateTime.SpecifyKind(ArgentinaTime.DateOf(utc).ToDateTime(TimeOnly.MinValue), DateTimeKind.Utc);

    /// <summary>
    /// Primer y último día (de Argentina) de la visión general: from/to si
    /// vienen, si no los últimos <paramref name="days"/> días hasta hoy. Hasta
    /// 366 días, como el resto de las estadísticas ("Este año" en un bisiesto).
    /// </summary>
    public static (DateOnly First, DateOnly Last) OverviewDays(DateOnly? from, DateOnly? to, int? days)
    {
        var today = ArgentinaTime.Today;
        if (from is not { } f)
            return (today.AddDays(1 - Math.Clamp(days ?? 30, 1, 366)), today);

        var t = to ?? today;
        if (t < f) (f, t) = (t, f);
        if (t.DayNumber - f.DayNumber + 1 > 366) f = t.AddDays(-365);
        return (f, t);
    }

    /// <summary>
    /// Ventana [since, until) del reporte: si viene from (y opcionalmente to),
    /// manda el rango explícito (días completos de Argentina, como el filtro
    /// del listado de ventas; tope 366); si no, los
    /// últimos `fallbackDays`. `until` exclusivo simplifica el "hasta hoy".
    /// </summary>
    public static (DateTime Since, DateTime Until) Range(DateOnly? from, DateOnly? to, int fallbackDays)
    {
        if (from is { } f)
        {
            var t = to ?? ArgentinaTime.Today;
            if (t < f) (f, t) = (t, f);
            var until = ArgentinaTime.StartOfDayUtc(t.AddDays(1));
            var since = ArgentinaTime.StartOfDayUtc(f);
            if ((until - since).TotalDays > 366) since = until.AddDays(-366);
            return (since, until);
        }
        return (DateTime.UtcNow.AddDays(-Math.Clamp(fallbackDays, 1, 366)), DateTime.UtcNow.AddDays(1));
    }
}
