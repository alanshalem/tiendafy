using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SharedKernel.Persistence;

namespace Themes.Infrastructure;

public static class ThemesModule
{
    public static IServiceCollection AddThemesModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddModuleDbContext<ThemesDbContext>(configuration);

        return services;
    }
}
