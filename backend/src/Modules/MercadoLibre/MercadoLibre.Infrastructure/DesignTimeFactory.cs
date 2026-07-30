using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace MercadoLibre.Infrastructure;

public sealed class DesignTimeFactory : IDesignTimeDbContextFactory<MeliDbContext>
{
    public MeliDbContext CreateDbContext(string[] args)
    {
        var connectionString = Environment.GetEnvironmentVariable("TIENDAFY_DB")
            ?? "Host=localhost;Port=5432;Database=tiendafy;Username=tiendafy;Password=tiendafy";

        var options = new DbContextOptionsBuilder<MeliDbContext>()
            .UseNpgsql(connectionString)
            .UseSnakeCaseNamingConvention()
            .Options;

        return new MeliDbContext(options);
    }
}
