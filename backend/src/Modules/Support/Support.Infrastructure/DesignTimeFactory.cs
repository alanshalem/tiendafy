using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Support.Infrastructure;

public sealed class DesignTimeFactory : IDesignTimeDbContextFactory<SupportDbContext>
{
    public SupportDbContext CreateDbContext(string[] args)
    {
        var connectionString = Environment.GetEnvironmentVariable("TIENDAFY_DB")
            ?? "Host=localhost;Port=5432;Database=tiendafy;Username=tiendafy;Password=tiendafy";

        var options = new DbContextOptionsBuilder<SupportDbContext>()
            .UseNpgsql(connectionString)
            .UseSnakeCaseNamingConvention()
            .Options;

        return new SupportDbContext(options);
    }
}
