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
    /// TLS explícito (H2/H3): TLS 1.2/1.3 y, en Linux, solo suites con ECDHE.
    /// Estaba copiado en cada cliente; un cambio de TLS tiene que llegar a los
    /// tres a la vez.
    ///
    /// <para>
    /// Por qué las suites: <c>servicios1.afip.gov.ar</c> (WSFEv1 de producción)
    /// elige DHE si el cliente lo ofrece, con un grupo DH de 1024 bits, y
    /// OpenSSL 3 con su nivel de seguridad por defecto (SECLEVEL=2) corta el
    /// handshake con <c>DH_KEY_TOO_SMALL</c>. Ofreciendo solo ECDHE negocia
    /// ECDHE-RSA-AES256-GCM-SHA384 sin bajar el nivel de seguridad. La lista
    /// por defecto de .NET en Linux ya es solo ECDHE, pero deja de mandar
    /// apenas el openssl.cnf de la imagen define un <c>CipherString</c>
    /// (pasa en varias distros): fijarla acá no depende de la imagen. Las
    /// pruebas contra los seis hosts están en docs/integraciones/arca.md.
    /// En Windows (desarrollo) la política de suites no existe y decide SChannel.
    /// </para>
    /// </summary>
    private static SocketsHttpHandler ArcaHandler() => new()
    {
        SslOptions = new SslClientAuthenticationOptions
        {
            EnabledSslProtocols = SslProtocols.Tls12 | SslProtocols.Tls13,
            CipherSuitesPolicy = OperatingSystem.IsLinux() ? EcdheOnly() : null,
        },
        PooledConnectionLifetime = TimeSpan.FromMinutes(5),
    };

    /// <summary>
    /// TLS 1.3 (que ARCA hoy no habla, pero el día que lo habilite no hay que
    /// tocar nada) y TLS 1.2 con intercambio ECDHE y AEAD. Sin DHE a propósito.
    /// </summary>
    [System.Runtime.Versioning.UnsupportedOSPlatform("windows")]
    internal static CipherSuitesPolicy EcdheOnly() => new(
    [
        TlsCipherSuite.TLS_AES_256_GCM_SHA384,
        TlsCipherSuite.TLS_AES_128_GCM_SHA256,
        TlsCipherSuite.TLS_CHACHA20_POLY1305_SHA256,
        TlsCipherSuite.TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384,
        TlsCipherSuite.TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256,
        TlsCipherSuite.TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384,
        TlsCipherSuite.TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256,
        TlsCipherSuite.TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256,
        TlsCipherSuite.TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256,
    ]);
}
