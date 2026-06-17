using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Payments.Contracts;
using Payments.Core.Abstractions;
using Payments.Core.Domain;
using Payments.Core.Features.Connect;
using Payments.Infrastructure.MercadoPago;
using Payments.Infrastructure.Persistence;
using Payments.Infrastructure.Security;

namespace Payments.Infrastructure;

public static class PaymentsModule
{
    public static IServiceCollection AddPaymentsModule(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("Default")
            ?? throw new InvalidOperationException("Missing connection string 'Default'.");

        services.AddDbContext<PaymentsDbContext>(options =>
            options.UseNpgsql(connectionString).UseSnakeCaseNamingConvention());

        services.Configure<MercadoPagoOptions>(configuration.GetSection(MercadoPagoOptions.SectionName));

        services.AddHttpClient<IMercadoPagoOAuthClient, MercadoPagoOAuthClient>();
        services.AddHttpClient<IMercadoPagoPaymentService, MercadoPagoCheckoutClient>();

        services.AddSingleton<ITokenProtector, DataProtectionTokenProtector>();
        services.AddSingleton<IOAuthStateProtector, DataProtectionStateProtector>();
        services.AddSingleton<IMercadoPagoWebhookValidator, MercadoPagoWebhookValidator>();

        services.AddScoped<IMercadoPagoConnectionRepository, MercadoPagoConnectionRepository>();
        services.AddScoped<BuildConnectUrlHandler>();
        services.AddScoped<OAuthCallbackHandler>();

        return services;
    }
}
