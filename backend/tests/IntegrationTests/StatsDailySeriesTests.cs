using System.Globalization;
using System.Text.Json;
using Analytics.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Orders.Infrastructure.Persistence;
using SharedKernel.Common;

namespace IntegrationTests;

/// <summary>
/// Las series diarias de Estadísticas cuentan días de Argentina, como el
/// filtro del listado de ventas: una venta de las 23:30 es de ese día. Antes
/// se agrupaba por día UTC y caía en el siguiente (y un rango "del 10 al 10"
/// la dejaba afuera).
/// </summary>
[Collection("api")]
public sealed class StatsDailySeriesTests(ApiFactory factory)
{
    [Fact]
    public async Task Una_venta_y_una_visita_de_las_23_30_caen_en_su_dia_de_Argentina()
    {
        var merchant = await Merchant.CreateAsync(factory, "std");
        var day = ArgentinaTime.Today.AddDays(-2);
        var at = ArgentinaTime.ToUtc(day.ToDateTime(new TimeOnly(23, 30))); // 02:30 UTC del día siguiente
        var d = day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        var next = day.AddDays(1).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

        var orderId = await merchant.CreateSaleAsync(priceMinor: 10_000_00);
        using (var scope = factory.Services.CreateScope())
        {
            var orders = scope.ServiceProvider.GetRequiredService<OrdersDbContext>();
            await orders.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE orders SET paid_at_utc = {at}, created_at_utc = {at} WHERE id = {orderId}");

            var analytics = scope.ServiceProvider.GetRequiredService<AnalyticsDbContext>();
            var view = PageView.Create(merchant.TenantId, "/productos/remera", null, "visitante-1", "sesion-1");
            analytics.PageViews.Add(view);
            await analytics.SaveChangesAsync();
            await analytics.PageViews.IgnoreQueryFilters().Where(v => v.Id == view.Id)
                .ExecuteUpdateAsync(s => s.SetProperty(v => v.OccurredAtUtc, at));
        }

        // Ventas de "ese día": entra, y la serie la pone en su fecha (mismo
        // formato de siempre: medianoche con Z, el panel lee la fecha).
        var sales = await merchant.GetAsync($"/api/v1/stats/sales?from={d}&to={d}");
        Assert.Equal(1, sales.GetProperty("orders").GetInt32());
        var point = Assert.Single(sales.GetProperty("series").EnumerateArray());
        Assert.Equal($"{d}T00:00:00Z", point.GetProperty("date").GetString());
        Assert.Equal(1, point.GetProperty("orders").GetInt32());

        // El resumen: el día local tiene la venta, el siguiente no, y la serie
        // termina en el hoy de Argentina.
        var series = (await merchant.GetAsync("/api/v1/stats/overview?days=7")).GetProperty("series").EnumerateArray().ToList();
        Assert.Equal(1, Day(series, d).GetProperty("orders").GetInt32());
        Assert.Equal(0, Day(series, next).GetProperty("orders").GetInt32());
        Assert.Equal(ArgentinaTime.Today.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture), series[^1].GetProperty("date").GetString());

        // Visitas, agrupadas en la base: misma regla.
        var visits = await merchant.GetAsync($"/api/v1/stats/visits?from={d}&to={d}");
        Assert.Equal(1, visits.GetProperty("totalViews").GetInt32());
        var visitDay = Assert.Single(visits.GetProperty("series").EnumerateArray());
        Assert.Equal($"{d}T00:00:00Z", visitDay.GetProperty("date").GetString());
        Assert.Equal(1, visitDay.GetProperty("views").GetInt32());
        Assert.Equal(1, visitDay.GetProperty("visitors").GetInt32());
    }

    private static JsonElement Day(List<JsonElement> series, string date) =>
        series.Single(p => p.GetProperty("date").GetString() == date);
}
