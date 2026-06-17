using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Notifications.Infrastructure;

public sealed class DesignTimeFactory : IDesignTimeDbContextFactory<NotificationsDbContext>
{
    public NotificationsDbContext CreateDbContext(string[] args)
    {
        var connectionString = Environment.GetEnvironmentVariable("TIENDAFY_DB")
            ?? "Host=127.0.0.1;Port=5432;Database=tiendafy;Username=tiendafy;Password=tiendafy";

        var options = new DbContextOptionsBuilder<NotificationsDbContext>()
            .UseNpgsql(connectionString)
            .UseSnakeCaseNamingConvention()
            .Options;

        return new NotificationsDbContext(options);
    }
}
