using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SharedKernel.Persistence;

namespace MercadoLibre.Infrastructure;

public static class MercadoLibreModule
{
    public static IServiceCollection AddMercadoLibreModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddModuleDbContext<MeliDbContext>(configuration);

        // El cliente de la API de Mercado Libre. Vivía en la Api aunque es de
        // este módulo; el servicio de tokens se quedó allá porque maneja el
        // state del OAuth, que pasa por el navegador (frontera HTTP).
        services.Configure<MeliOptions>(configuration.GetSection(MeliOptions.SectionName));
        services.AddHttpClient<MeliClient>(c => c.Timeout = TimeSpan.FromSeconds(20));

        return services;
    }
}
