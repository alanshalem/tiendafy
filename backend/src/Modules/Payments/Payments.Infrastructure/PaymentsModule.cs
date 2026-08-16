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
using SharedKernel.Persistence;

namespace Payments.Infrastructure;

public static class PaymentsModule
{
    public static IServiceCollection AddPaymentsModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddModuleDbContext<PaymentsDbContext>(configuration);

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
