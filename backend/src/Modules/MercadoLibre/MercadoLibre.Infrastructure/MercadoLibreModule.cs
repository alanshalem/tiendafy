using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SharedKernel.Persistence;

namespace MercadoLibre.Infrastructure;

public static class MercadoLibreModule
{
    public static IServiceCollection AddMercadoLibreModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddModuleDbContext<MeliDbContext>(configuration);

        return services;
    }
}
