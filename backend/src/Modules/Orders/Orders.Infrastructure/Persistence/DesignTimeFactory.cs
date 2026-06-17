using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Orders.Infrastructure.Persistence;

public sealed class DesignTimeFactory : IDesignTimeDbContextFactory<OrdersDbContext>
{
    public OrdersDbContext CreateDbContext(string[] args)
    {
        var connectionString = Environment.GetEnvironmentVariable("TIENDAFY_DB")
            ?? "Host=127.0.0.1;Port=5432;Database=tiendafy;Username=tiendafy;Password=tiendafy";

        var options = new DbContextOptionsBuilder<OrdersDbContext>()
            .UseNpgsql(connectionString)
            .UseSnakeCaseNamingConvention()
            .Options;

        return new OrdersDbContext(options);
    }
}
