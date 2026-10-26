using System.Globalization;
using Api.Stats;
using SharedKernel.Common;

namespace Api.Ai.Assistant;

/// <summary>Monto en centavos (crudo) con su versión para leer en pesos.</summary>
public sealed record AiMoney(long Minor, string Currency, string Text);

/// <summary>Monto en unidades (por ejemplo el FOB de una compra), ya con decimales.</summary>
public sealed record AiAmount(decimal Value, string Currency, string Text);

public sealed record AiPercent(decimal Value, string Text);

/// <summary>Período de días completos de Argentina, AAAA-MM-DD en crudo y en texto.</summary>
public sealed record AiPeriod(string From, string To, int Days, bool Clamped, string Text);

/// <summary>
/// Formato de montos, porcentajes, períodos y fechas que devuelven las
/// herramientas del asistente. Siempre con <see cref="ArgentineNumbers"/>: el
/// contenedor corre con cultura invariante.
/// </summary>
public static class AssistantFormat
{
    public static AiMoney Money(long minor, string currency) =>
        new(minor, currency, ArgentineNumbers.Money(new SharedKernel.Common.Money(minor, currency)));

    public static AiAmount Amount(decimal value, string currency) =>
        new(value, currency, $"{currency} {ArgentineNumbers.Number(value, 2)}");

    public static AiPercent Percent(decimal value) =>
        new(value, ArgentineNumbers.Number(value, 1) + " %");

    public static AiPeriod Period(StatsPeriod p) =>
        new(
            p.From.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            p.To.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            p.Days,
            p.Clamped,
            p.Text);

    /// <summary>La fecha (dd/MM/yyyy) del día de Argentina de un instante UTC.</summary>
    public static string Date(DateTime utc) =>
        ArgentinaTime.DateOf(utc).ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
}
