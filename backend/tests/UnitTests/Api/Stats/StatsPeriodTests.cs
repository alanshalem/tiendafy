using Api.Stats;
using SharedKernel.Common;

namespace UnitTests.Api.Stats;

/// <summary>
/// El período de las estadísticas vive en un solo lugar: lo usan los reportes
/// del panel y el asistente. Estos tests fijan cómo se arma, se recorta y se
/// muestra, y que mover <c>Range</c> y <c>OverviewDays</c> no cambió su cuenta.
/// </summary>
public sealed class StatsPeriodTests
{
    private static readonly DateOnly Today = new(2026, 10, 25);

    [Fact]
    public void Parse_sin_fechas_son_los_ultimos_30_dias()
    {
        var period = StatsPeriod.Parse(null, null, Today).Value;

        Assert.Equal(new DateOnly(2026, 9, 26), period.From);
        Assert.Equal(Today, period.To);
        Assert.Equal(30, period.Days);
        Assert.False(period.Clamped);
    }

    [Fact]
    public void Parse_recorta_a_366_dias_y_lo_avisa()
    {
        var period = StatsPeriod.Parse("2020-01-01", "2026-10-25", Today).Value;

        Assert.Equal(366, period.Days);
        Assert.True(period.Clamped);
        Assert.Equal(Today, period.To);
        Assert.Equal(Today.AddDays(-365), period.From);
    }

    [Fact]
    public void Parse_da_vuelta_fechas_invertidas()
    {
        var period = StatsPeriod.Parse("2026-10-20", "2026-10-10", Today).Value;

        Assert.Equal(new DateOnly(2026, 10, 10), period.From);
        Assert.Equal(new DateOnly(2026, 10, 20), period.To);
    }

    [Fact]
    public void Parse_no_pasa_de_hoy()
    {
        var period = StatsPeriod.Parse("2026-10-01", "2027-01-01", Today).Value;

        Assert.Equal(Today, period.To);
    }

    [Fact]
    public void Parse_fecha_mal_formada_da_BadDate()
    {
        var result = StatsPeriod.Parse("25/10/2026", null, Today);

        Assert.True(result.IsFailure);
        Assert.Equal("Assistant.BadDate", result.Error.Code);
    }

    [Fact]
    public void Parse_desde_futura_sin_hasta_no_termina_en_el_futuro()
    {
        var period = StatsPeriod.Parse("2026-10-26", null, Today).Value;

        Assert.Equal(Today, period.From);
        Assert.Equal(Today, period.To);
        Assert.Equal("el 25/10/2026", period.Text);
    }

    [Fact]
    public void Parse_desde_y_hasta_futuros_dan_hoy()
    {
        var period = StatsPeriod.Parse("2026-11-01", "2026-12-01", Today).Value;

        Assert.Equal(Today, period.From);
        Assert.Equal(Today, period.To);
        Assert.DoesNotContain("2026", period.Text.Replace("25/10/2026", ""));
    }

    [Theory]
    [InlineData("2026-1-5", null)]
    [InlineData(null, "25/10/2026")]
    [InlineData("2026-10-01", "ayer")]
    public void Parse_fecha_mal_formada_en_desde_o_hasta_da_BadDate(string? desde, string? hasta)
    {
        var result = StatsPeriod.Parse(desde, hasta, Today);

        Assert.True(result.IsFailure);
        Assert.Equal("Assistant.BadDate", result.Error.Code);
    }

    [Fact]
    public void Parse_usa_defaultDays_cuando_falta_desde()
    {
        var period = StatsPeriod.Parse(null, null, Today, defaultDays: 7).Value;

        Assert.Equal(new DateOnly(2026, 10, 19), period.From);
        Assert.Equal(7, period.Days);
    }

    [Fact]
    public void Parse_hasta_sin_desde_cuenta_hacia_atras_desde_hasta()
    {
        var period = StatsPeriod.Parse(null, "2026-10-10", Today).Value;

        Assert.Equal(new DateOnly(2026, 9, 11), period.From);
        Assert.Equal(new DateOnly(2026, 10, 10), period.To);
        Assert.Equal(30, period.Days);
    }

    [Fact]
    public void Text_en_formato_argentino()
    {
        var period = StatsPeriod.FromDays(new DateOnly(2026, 10, 1), new DateOnly(2026, 10, 25));

        Assert.Equal("del 01/10/2026 al 25/10/2026", period.Text);
        Assert.Equal("el 25/10/2026", StatsPeriod.FromDays(Today, Today).Text);
    }

    [Fact]
    public void Since_y_Until_en_hora_argentina()
    {
        var d = new DateOnly(2026, 10, 25);
        var period = StatsPeriod.FromDays(d, d);

        Assert.Equal(ArgentinaTime.StartOfDayUtc(d), period.SinceUtc);
        Assert.Equal(ArgentinaTime.StartOfDayUtc(d.AddDays(1)), period.UntilUtc);
    }

    [Fact]
    public void Range_y_OverviewDays_igual_que_antes()
    {
        var today = ArgentinaTime.Today;

        // Más de 366 días: se queda con los últimos 366.
        var (first, last) = StatsRanges.OverviewDays(today.AddDays(-1000), today, null);
        Assert.Equal(today, last);
        Assert.Equal(366, last.DayNumber - first.DayNumber + 1);

        // from > to: se dan vuelta.
        (first, last) = StatsRanges.OverviewDays(new DateOnly(2026, 10, 20), new DateOnly(2026, 10, 10), null);
        Assert.Equal(new DateOnly(2026, 10, 10), first);
        Assert.Equal(new DateOnly(2026, 10, 20), last);

        // Sin from: los últimos `days` hasta hoy, con tope de 366.
        (first, last) = StatsRanges.OverviewDays(null, null, 7);
        Assert.Equal(today, last);
        Assert.Equal(today.AddDays(-6), first);
        (first, _) = StatsRanges.OverviewDays(null, null, 5000);
        Assert.Equal(today.AddDays(-365), first);

        // Range: explícito, con tope de 366 días y fechas dadas vuelta.
        var (since, until) = StatsRanges.Range(today.AddDays(-1000), today, 30);
        Assert.Equal(ArgentinaTime.StartOfDayUtc(today.AddDays(1)), until);
        Assert.Equal(366, (until - since).TotalDays);

        (since, until) = StatsRanges.Range(new DateOnly(2026, 10, 20), new DateOnly(2026, 10, 10), 30);
        Assert.Equal(ArgentinaTime.StartOfDayUtc(new DateOnly(2026, 10, 10)), since);
        Assert.Equal(ArgentinaTime.StartOfDayUtc(new DateOnly(2026, 10, 21)), until);

        // Sin from: los últimos `fallbackDays` hasta mañana.
        (since, until) = StatsRanges.Range(null, null, 14);
        Assert.InRange((until - since).TotalDays, 14.9, 15.1);
    }

    [Fact]
    public void LocalDay_es_medianoche_argentina_con_Kind_Utc()
    {
        // 01:00 UTC del 16 es todavía el 15 en Argentina.
        var day = StatsRanges.LocalDay(new DateTime(2026, 10, 16, 1, 0, 0, DateTimeKind.Utc));

        Assert.Equal(new DateTime(2026, 10, 15, 0, 0, 0, DateTimeKind.Utc), day);
        Assert.Equal(DateTimeKind.Utc, day.Kind);
    }
}
