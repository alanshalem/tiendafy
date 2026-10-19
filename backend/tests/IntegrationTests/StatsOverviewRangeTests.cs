using System.Globalization;
using Customers.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Orders.Infrastructure.Persistence;
using SharedKernel.Common;

namespace IntegrationTests;

/// <summary>
/// La visión general de Estadísticas responde al período elegido por fechas
/// (from/to), como el resto de las pantallas. Antes solo leía `days`: el
/// panel mandaba la cantidad de días del período y la API contaba siempre
/// hasta hoy, así que un rango del pasado mostraba las ventas de otros días.
/// </summary>
[Collection("api")]
public sealed class StatsOverviewRangeTests(ApiFactory factory)
{
    [Fact]
    public async Task Un_rango_del_pasado_cuenta_sus_ventas_y_clientes_y_los_compara_con_el_anterior()
    {
        var merchant = await Merchant.CreateAsync(factory, "sor");
        var today = ArgentinaTime.Today;
        var from = today.AddDays(-40);
        var to = today.AddDays(-31); // 10 días; el anterior va de -50 a -41

        var inRange = await merchant.CreateSaleAsync(priceMinor: 1_000_00, buyerEmail: "a@test.local");
        var inPrevious = await merchant.CreateSaleAsync(priceMinor: 2_000_00, buyerEmail: "b@test.local");
        await merchant.CreateSaleAsync(priceMinor: 4_000_00, buyerEmail: "c@test.local"); // hoy: afuera

        using (var scope = factory.Services.CreateScope())
        {
            var orders = scope.ServiceProvider.GetRequiredService<OrdersDbContext>();
            await MoveAsync(orders, inRange, NoonOf(today.AddDays(-35)));
            await MoveAsync(orders, inPrevious, NoonOf(today.AddDays(-45)));

            // Clientes: dos nuevos en el período, uno en el anterior (más los
            // que dejaron las ventas de hoy, que no cuentan).
            var customers = scope.ServiceProvider.GetRequiredService<CustomersDbContext>();
            await AddCustomerAsync(customers, merchant.TenantId, NoonOf(today.AddDays(-33)));
            await AddCustomerAsync(customers, merchant.TenantId, NoonOf(today.AddDays(-39)));
            await AddCustomerAsync(customers, merchant.TenantId, NoonOf(today.AddDays(-48)));
        }

        var overview = await merchant.GetAsync($"/api/v1/stats/overview?from={Iso(from)}&to={Iso(to)}");

        Assert.Equal(Iso(from), overview.GetProperty("from").GetString());
        Assert.Equal(Iso(to), overview.GetProperty("to").GetString());
        Assert.Equal(10, overview.GetProperty("days").GetInt32());

        var sales = overview.GetProperty("sales");
        Assert.Equal(1, sales.GetProperty("orders").GetInt32());
        Assert.Equal(1_000_00, sales.GetProperty("revenue").GetInt64());
        Assert.Equal(1, sales.GetProperty("previous").GetProperty("orders").GetInt32());
        Assert.Equal(2_000_00, sales.GetProperty("previous").GetProperty("revenue").GetInt64());
        Assert.Equal(1_000_00, overview.GetProperty("channels").GetProperty("own").GetProperty("revenue").GetInt64());

        var newCustomers = overview.GetProperty("newCustomers");
        Assert.Equal(2, newCustomers.GetProperty("current").GetInt32());
        Assert.Equal(1, newCustomers.GetProperty("previous").GetInt32());

        // La serie es la del período: del primer al último día elegido.
        var series = overview.GetProperty("series").EnumerateArray().ToList();
        Assert.Equal(10, series.Count);
        Assert.Equal(Iso(from), series[0].GetProperty("date").GetString());
        Assert.Equal(Iso(to), series[^1].GetProperty("date").GetString());
        Assert.Equal(1, series.Single(p => p.GetProperty("date").GetString() == Iso(today.AddDays(-35)))
            .GetProperty("orders").GetInt32());

        Assert.Single(overview.GetProperty("topProducts").EnumerateArray());
    }

    [Fact]
    public async Task Hoy_es_el_dia_de_Argentina_no_las_ultimas_24_horas()
    {
        var merchant = await Merchant.CreateAsync(factory, "soh");
        var today = ArgentinaTime.Today;
        var yesterday = await merchant.CreateSaleAsync(priceMinor: 1_000_00);
        await merchant.CreateSaleAsync(priceMinor: 3_000_00);

        using (var scope = factory.Services.CreateScope())
        {
            // Ayer a las 23:59 de Argentina: con "las últimas 24 horas" podía
            // caer adentro de "Hoy".
            var orders = scope.ServiceProvider.GetRequiredService<OrdersDbContext>();
            await MoveAsync(orders, yesterday, ArgentinaTime.ToUtc(today.AddDays(-1).ToDateTime(new TimeOnly(23, 59))));
        }

        var overview = await merchant.GetAsync($"/api/v1/stats/overview?from={Iso(today)}&to={Iso(today)}");
        var sales = overview.GetProperty("sales");
        Assert.Equal(1, sales.GetProperty("orders").GetInt32());
        Assert.Equal(3_000_00, sales.GetProperty("revenue").GetInt64());
        Assert.Equal(1_000_00, sales.GetProperty("previous").GetProperty("revenue").GetInt64());
        Assert.Equal(Iso(today), Assert.Single(overview.GetProperty("series").EnumerateArray()).GetProperty("date").GetString());
    }

    private static string Iso(DateOnly d) => d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    private static DateTime NoonOf(DateOnly day) => ArgentinaTime.ToUtc(day.ToDateTime(new TimeOnly(12, 0)));

    private static async Task MoveAsync(OrdersDbContext orders, Guid orderId, DateTime at) =>
        await orders.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE orders SET paid_at_utc = {at}, created_at_utc = {at} WHERE id = {orderId}");

    private static async Task AddCustomerAsync(CustomersDbContext db, Guid tenantId, DateTime createdAt)
    {
        var customer = Customer.Create(tenantId, "Cliente", $"{Guid.NewGuid():N}@test.local", null, null, null).Value;
        db.Customers.Add(customer);
        await db.SaveChangesAsync();
        await db.Customers.IgnoreQueryFilters().Where(c => c.Id == customer.Id)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.CreatedAtUtc, createdAt));
    }
}
