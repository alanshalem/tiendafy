using Fiscal.Contracts;
using Fiscal.Infrastructure.Persistence;
using Fiscal.Infrastructure.Security;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Fiscal.Infrastructure;

public static class FiscalModule
{
    public static IServiceCollection AddFiscalModule(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("Default")
            ?? throw new InvalidOperationException("Missing connection string 'Default'.");

        services.AddDbContext<FiscalDbContext>(options =>
            options.UseNpgsql(connectionString).UseSnakeCaseNamingConvention());

        services.AddSingleton<IFiscalSecretProtector, FiscalSecretProtector>();
        services.AddSingleton<IFiscalCertificateFactory, FiscalCertificateFactory>();

        return services;
    }
}
