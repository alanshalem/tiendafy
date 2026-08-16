using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SharedKernel.Persistence;

namespace Discounts.Infrastructure;

public static class DiscountsModule
{
    public static IServiceCollection AddDiscountsModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddModuleDbContext<DiscountsDbContext>(configuration);

        return services;
    }
}
