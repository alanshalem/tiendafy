namespace SharedKernel.Common;

/// <summary>
/// La hora de los comercios: Argentina, UTC−3 fijo (sin horario de verano desde
/// 2009). En la base todo es UTC; esto es para lo que ve una persona (fechas en
/// mails, PDFs y nombres de archivo) y para cortar "días" como los cuenta el
/// comercio: una venta de las 22 h es de ese día, no del siguiente.
/// </summary>
public static class ArgentinaTime
{
    public static readonly TimeSpan Offset = TimeSpan.FromHours(-3);

    /// <summary>La hora local (Kind Unspecified) de un instante UTC.</summary>
    public static DateTime ToLocal(DateTime utc) => DateTime.SpecifyKind(utc + Offset, DateTimeKind.Unspecified);

    /// <summary>El día local de un instante UTC.</summary>
    public static DateOnly DateOf(DateTime utc) => DateOnly.FromDateTime(utc + Offset);

    /// <summary>El instante UTC en que empieza un día local (00:00 en Argentina).</summary>
    public static DateTime StartOfDayUtc(DateOnly day) =>
        DateTime.SpecifyKind(day.ToDateTime(TimeOnly.MinValue) - Offset, DateTimeKind.Utc);

    /// <summary>El instante UTC de una hora local (Kind Unspecified o Local tomada como Argentina).</summary>
    public static DateTime ToUtc(DateTime local) => DateTime.SpecifyKind(local - Offset, DateTimeKind.Utc);

    public static DateTime Now => ToLocal(DateTime.UtcNow);
    public static DateOnly Today => DateOf(DateTime.UtcNow);
}
