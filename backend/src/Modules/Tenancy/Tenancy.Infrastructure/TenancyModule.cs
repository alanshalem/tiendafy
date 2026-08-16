using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SharedKernel.Abstractions;
using SharedKernel.Persistence;
using Tenancy.Contracts;
using Tenancy.Core.Application;
using Tenancy.Core.Domain;
using Tenancy.Core.Features.CreateTenant;
using Tenancy.Core.Features.UpdateTenant;
using Tenancy.Infrastructure.Persistence;

namespace Tenancy.Infrastructure;

/// <summary>Registro DI del módulo completo — única línea que toca el host.</summary>
public static class TenancyModule
{
    public static IServiceCollection AddTenancyModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddModuleDbContext<TenancyDbContext>(configuration);

        services.AddSingleton(new TenancyOptions
        {
            PlatformBaseDomain = configuration["Tenancy:PlatformBaseDomain"] ?? "localhost",
        });

        services.AddScoped<ITenantRepository, TenantRepository>();
        services.AddScoped<ITenancyService, TenancyService>();

        // UoW explícito del módulo (IUnitOfWork global colisionaría entre módulos).
        services.AddScoped<CreateTenantHandler>(sp => new CreateTenantHandler(
            sp.GetRequiredService<ITenantRepository>(),
            sp.GetRequiredService<TenancyDbContext>()));
        services.AddScoped<UpdateTenantHandler>(sp => new UpdateTenantHandler(
            sp.GetRequiredService<ITenantRepository>(),
            sp.GetRequiredService<TenancyDbContext>()));

        return services;
    }
}
