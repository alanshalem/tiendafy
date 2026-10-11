using System.Net.Security;
using System.Security.Authentication;
using Fiscal.Contracts;
using Fiscal.Core.Abstractions;
using Fiscal.Infrastructure.Emission;
using Fiscal.Infrastructure.Padron;
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

        services.AddHttpClient<WsaaClient>().ConfigurePrimaryHttpMessageHandler(ArcaHandler);
        services.AddScoped<IFiscalAuthenticator, FiscalAuthenticator>();

        services.AddHttpClient<WsfeClient>().ConfigurePrimaryHttpMessageHandler(ArcaHandler);
        services.AddScoped<IFiscalGateway>(sp => sp.GetRequiredService<WsfeClient>());

        services.AddHttpClient<PadronA5Client>().ConfigurePrimaryHttpMessageHandler(ArcaHandler);
        services.AddScoped<ITaxpayerRegistry>(sp => sp.GetRequiredService<PadronA5Client>());
        services.AddScoped<IInvoiceEmitter, EmitInvoiceHandler>();
        services.AddScoped<IFiscalEmissionQueue, FiscalEmissionQueue>();

        return services;
    }

    /// <summary>
    /// El handler HTTP de todo lo que habla con ARCA (WSAA, WSFEv1, padrón), con
    /// TLS explícito (H2/H3): forzar TLS 1.2/1.3 evita el "anda en homologación,
    /// revienta en producción". El DH_KEY_TOO_SMALL de servicios1 se ataja
    /// además con el SECLEVEL de la imagen (documentado en el ADR de
    /// despliegue). Estaba copiado en cada cliente; un cambio de TLS tiene que
    /// llegar a los tres a la vez.
    /// </summary>
    private static SocketsHttpHandler ArcaHandler() => new()
    {
        SslOptions = new SslClientAuthenticationOptions
        {
            EnabledSslProtocols = SslProtocols.Tls12 | SslProtocols.Tls13,
        },
        PooledConnectionLifetime = TimeSpan.FromMinutes(5),
    };
}
