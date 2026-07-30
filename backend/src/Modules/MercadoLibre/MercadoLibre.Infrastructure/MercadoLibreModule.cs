using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace MercadoLibre.Infrastructure;

public static class MercadoLibreModule
{
    public static IServiceCollection AddMercadoLibreModule(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("Default")
            ?? throw new InvalidOperationException("Missing connection string 'Default'.");

        services.AddDbContext<MeliDbContext>(options =>
            options.UseNpgsql(connectionString).UseSnakeCaseNamingConvention());

        return services;
    }
}
