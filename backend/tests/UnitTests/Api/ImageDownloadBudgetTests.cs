using Api.Import;

namespace UnitTests.Api;

/// <summary>
/// El worker de importación es uno para todas las tiendas: lo que descarga de
/// las URLs de una planilla tiene tope de cantidad y de tiempo, por job y por fila.
/// </summary>
public sealed class ImageDownloadBudgetTests
{
    private sealed class ManualClock : TimeProvider
    {
        private long _ticks;
        public override long TimestampFrequency => TimeSpan.TicksPerSecond;
        public override long GetTimestamp() => _ticks;
        public void Advance(TimeSpan by) => _ticks += by.Ticks;
    }

    [Fact]
    public void Pasado_el_maximo_de_descargas_no_da_mas()
    {
        var budget = new ImageDownloadBudget(maxDownloads: 3);

        Assert.True(budget.TryTake());
        Assert.True(budget.TryTake());
        Assert.True(budget.TryTake());
        Assert.False(budget.TryTake());
        Assert.Equal(3, budget.Downloads);
    }

    [Fact]
    public void Pasado_el_tiempo_del_job_no_da_mas_aunque_sea_otra_fila()
    {
        var clock = new ManualClock();
        var budget = new ImageDownloadBudget(jobTime: TimeSpan.FromMinutes(10), rowTime: TimeSpan.FromMinutes(5), clock: clock);

        clock.Advance(TimeSpan.FromMinutes(11));
        budget.BeginRow();

        Assert.False(budget.TryTake());
    }

    [Fact]
    public void Pasado_el_tiempo_de_la_fila_no_da_mas_pero_la_fila_siguiente_arranca_de_cero()
    {
        var clock = new ManualClock();
        var budget = new ImageDownloadBudget(jobTime: TimeSpan.FromHours(1), rowTime: TimeSpan.FromSeconds(90), clock: clock);

        budget.BeginRow();
        Assert.True(budget.TryTake());
        clock.Advance(TimeSpan.FromSeconds(91));
        Assert.False(budget.TryTake());

        budget.BeginRow();
        Assert.True(budget.TryTake());
    }
}
