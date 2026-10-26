using Api.Ai.Assistant;

namespace UnitTests.Api.Ai.Assistant;

/// <summary>
/// Lo que las herramientas del asistente le devuelven al modelo: montos crudos y
/// formateados en formato argentino, porcentajes con coma, la fecha del día de
/// Argentina y los límites de los argumentos.
/// </summary>
public sealed class AssistantFormatTests
{
    [Fact]
    public void Money_crudo_y_formateado()
    {
        var money = AssistantFormat.Money(1_500_000, "ARS");

        Assert.Equal(1_500_000, money.Minor);
        Assert.Equal("ARS 15.000", money.Text);
    }

    [Fact]
    public void Amount_con_dos_decimales()
    {
        var amount = AssistantFormat.Amount(12345.5m, "USD");

        Assert.Equal("USD 12.345,50", amount.Text);
    }

    [Fact]
    public void Percent_con_coma()
    {
        var percent = AssistantFormat.Percent(12.345m);

        Assert.Equal("12,3 %", percent.Text);
    }

    [Fact]
    public void Limit_recorta()
    {
        Assert.Equal(20, AssistantArgs.Limit(999, 20, 10));
        Assert.Equal(1, AssistantArgs.Limit(0, 20, 10));
        Assert.Equal(10, AssistantArgs.Limit(null, 20, 10));
    }

    [Fact]
    public void Fecha_en_dia_argentino()
    {
        // 02:30 UTC del 1 de noviembre es el 31 de octubre a las 23:30 en Argentina.
        var date = AssistantFormat.Date(new DateTime(2026, 11, 1, 2, 30, 0, DateTimeKind.Utc));

        Assert.Equal("31/10/2026", date);
    }
}
