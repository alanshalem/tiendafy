using System.Net.Security;
using System.Security.Authentication;
using Fiscal.Contracts;
using Fiscal.Core.Abstractions;
using Fiscal.Infrastructure.Emission;
using Fiscal.Infrastructure.Persistence;
using Fiscal.Infrastructure.Security;
using Fiscal.Infrastructure.Wsaa;
using Fiscal.Infrastructure.Wsfe;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SharedKernel.Persistence;

namespace Fiscal.Infrastructure;

public static class FiscalModule
{
    public static IServiceCollection AddFiscalModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddModuleDbContext<FiscalDbContext>(configuration);

        services.Configure<FiscalEndpointsOptions>(configuration.GetSection(FiscalEndpointsOptions.SectionName));

        services.AddSingleton<IFiscalSecretProtector, FiscalSecretProtector>();
        services.AddSingleton<IFiscalCertificateFactory, FiscalCertificateFactory>();
        services.AddSingleton<IComprobantePdfRenderer, Pdf.ComprobantePdfRenderer>();

        // HttpClient de WSAA con TLS explícito (H2/H3): forzar TLS 1.2/1.3 para
        // evitar el "anda en homologación, revienta en producción". El
        // DH_KEY_TOO_SMALL de servicios1 se ataja además con el SECLEVEL de la
        // imagen (documentado en el ADR de despliegue).
        services.AddHttpClient<WsaaClient>()
            .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
            {
                SslOptions = new SslClientAuthenticationOptions
                {
                    EnabledSslProtocols = SslProtocols.Tls12 | SslProtocols.Tls13,
                },
                PooledConnectionLifetime = TimeSpan.FromMinutes(5),
            });

        services.AddScoped<IFiscalAuthenticator, FiscalAuthenticator>();

        // Adapter WSFEv1 (mismo TLS explícito que WSAA, H2/H3).
        services.AddHttpClient<WsfeClient>()
            .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
            {
                SslOptions = new SslClientAuthenticationOptions
                {
                    EnabledSslProtocols = SslProtocols.Tls12 | SslProtocols.Tls13,
                },
                PooledConnectionLifetime = TimeSpan.FromMinutes(5),
            });
        services.AddScoped<IFiscalGateway>(sp => sp.GetRequiredService<WsfeClient>());
        services.AddScoped<IInvoiceEmitter, EmitInvoiceHandler>();
        services.AddScoped<IFiscalEmissionQueue, FiscalEmissionQueue>();

        return services;
    }
}
