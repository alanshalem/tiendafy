using Api.Endpoints;
using Microsoft.AspNetCore.HttpOverrides;

namespace Api.Startup;

/// <summary>Piezas del pipeline HTTP que vivían inline en Program.cs.</summary>
public static class PipelineExtensions
{
    /// <summary>
    /// Prod: detrás de un reverse proxy/ingress que termina TLS. Confiamos en
    /// X-Forwarded-* para conocer el esquema/host reales + HSTS. El redirect a
    /// HTTPS lo hace el proxy (no la app, para evitar loops).
    /// </summary>
    public static WebApplication UseProxyHeaders(this WebApplication app)
    {
        if (app.Environment.IsDevelopment()) return app;

        var fwd = new ForwardedHeadersOptions
        {
            ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto,
        };
        // Sin KnownProxies/KnownNetworks, ASP.NET solo confía en loopback y descarta
        // el X-Forwarded-For del LB → todo el tráfico cae en la misma IP y el
        // rate-limiting particiona mal. Se configura el rango real del proxy por
        // config (CIDR); si no hay, se limpian los defaults para forzar la config
        // en el deploy en vez de aceptar un forwarded spoofeable.
        fwd.KnownProxies.Clear();
        fwd.KnownIPNetworks.Clear();
        foreach (var network in TrustedNetworks.From(app.Configuration))
            fwd.KnownIPNetworks.Add(network);
        app.UseForwardedHeaders(fwd);
        app.UseHsts();
        return app;
    }

    /// <summary>Los 30 grupos de endpoints bajo /api/v1.</summary>
    public static WebApplication MapApiV1(this WebApplication app)
    {
        var apiV1 = app.MapGroup("/api/v1");
        apiV1.MapTenantEndpoints();
        apiV1.MapAuthEndpoints();
        apiV1.MapProductEndpoints();
        apiV1.MapPriceListEndpoints();
        apiV1.MapCategoryEndpoints();
        apiV1.MapDiscountsEndpoints();
        apiV1.MapCustomerEndpoints();
        apiV1.MapPageEndpoints();
        apiV1.MapStatsEndpoints();
        apiV1.MapThemeEndpoints();
        apiV1.MapMediaEndpoints();
        apiV1.MapSupportEndpoints();
        apiV1.MapPurchasingEndpoints();
        apiV1.MapQuoteEndpoints();
        apiV1.MapFinanceEndpoints();
        apiV1.MapSupplierEndpoints();
        apiV1.MapMetaAdsEndpoints();
        apiV1.MapFiscalEndpoints();
        apiV1.MapWhatsAppEndpoints();
        apiV1.MapInventoryEndpoints();
        apiV1.MapCheckoutEndpoints();
        apiV1.MapShippingEndpoints();
        apiV1.MapCorreoArgentinoEndpoints();
        apiV1.MapZipnovaEndpoints();
        apiV1.MapAndreaniEndpoints();
        apiV1.MapCampaignEndpoints();
        apiV1.MapPaymentsEndpoints();
        apiV1.MapPaywayEndpoints();
        apiV1.MapMeliEndpoints();
        apiV1.MapSocialEndpoints();
        apiV1.MapAiEndpoints();
        apiV1.MapOrderEndpoints();
        apiV1.MapPaymentWebhookEndpoints();
        apiV1.MapTrackEndpoints();
        apiV1.MapEmailTemplateEndpoints();
        apiV1.MapShopAuthEndpoints();
        apiV1.MapShopFavoritesEndpoints();
        apiV1.MapShopOrdersEndpoints();
        apiV1.MapContactEndpoints();
        apiV1.MapMembersEndpoints();
        apiV1.MapInboxEndpoints();

        // Herramientas de desarrollo (sembrar datos de demo). Fuera de
        // Development estas rutas directamente no existen.
        if (app.Environment.IsDevelopment()) apiV1.MapDevEndpoints();

        return app;
    }
}
