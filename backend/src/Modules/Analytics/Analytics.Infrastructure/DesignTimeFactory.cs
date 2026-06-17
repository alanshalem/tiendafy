using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Analytics.Infrastructure;

public sealed class DesignTimeFactory : IDesignTimeDbContextFactory<AnalyticsDbContext>
{
    public AnalyticsDbContext CreateDbContext(string[] args)
    {
        var connectionString = Environment.GetEnvironmentVariable("TIENDAFY_DB")
            ?? "Host=127.0.0.1;Port=5432;Database=tiendafy;Username=tiendafy;Password=tiendafy";

        var options = new DbContextOptionsBuilder<AnalyticsDbContext>()
            .UseNpgsql(connectionString)
            .UseSnakeCaseNamingConvention()
            .Options;

        return new AnalyticsDbContext(options);
    }
}
