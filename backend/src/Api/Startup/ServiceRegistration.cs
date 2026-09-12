using System.Threading.RateLimiting;
using Analytics.Infrastructure;
using Api.Import;
using Api.Middleware;
using Api.Notifications;
using Api.Payments;
using Catalog.Infrastructure;
using Checkout.Infrastructure;
using Content.Infrastructure;
using Customers.Infrastructure;
using Discounts.Infrastructure;
using Finance.Infrastructure;
using Fiscal.Infrastructure;
using Identity.Infrastructure;
using Inventory.Infrastructure;
using Media.Infrastructure;
using MercadoLibre.Infrastructure;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Notifications.Infrastructure;
using Orders.Infrastructure;
using Payments.Infrastructure;
using Purchasing.Infrastructure;
using Serilog;
using SharedKernel.Abstractions;
using Social.Infrastructure;
using Support.Infrastructure;
using Tenancy.Infrastructure;
using Tenancy.Infrastructure.Persistence;
using Themes.Infrastructure;

namespace Api.Startup;

/// <summary>
/// Registro de servicios de Program.cs, agrupado por área. El ORDEN de los
/// AddHostedService se preserva exactamente (define el orden de arranque).
/// </summary>
public static class ServiceRegistration
{
    /// <summary>Logging estructurado (Serilog) + error-tracking (Sentry, gated por DSN).</summary>
    public static WebApplicationBuilder AddObservability(this WebApplicationBuilder builder)
    {
        // Serilog escribe JSON estructurado a stdout.
        builder.Host.UseSerilog((ctx, cfg) => cfg
            .ReadFrom.Configuration(ctx.Configuration)
            .MinimumLevel.Information()
            .MinimumLevel.Override("Microsoft", Serilog.Events.LogEventLevel.Warning)
            .MinimumLevel.Override("Microsoft.EntityFrameworkCore", Serilog.Events.LogEventLevel.Warning)
            .Enrich.FromLogContext()
            .WriteTo.Console());
        // DSN vacío = Sentry desactivado (sin DSN, UseSentry() tira ArgumentNullException).
        builder.WebHost.UseSentry(o => o.Dsn = builder.Configuration["Sentry:Dsn"] ?? string.Empty);
        return builder;
    }

    /// <summary>Los 19 módulos del monolito.</summary>
    public static IServiceCollection AddAllModules(
        this IServiceCollection services, IConfiguration configuration, bool isProduction = false)
    {
        services.AddTenancyModule(configuration);
        services.AddIdentityModule(configuration);
        services.AddCatalogModule(configuration);
        services.AddDiscountsModule(configuration);
        services.AddCustomersModule(configuration);
        services.AddContentModule(configuration);
        services.AddThemesModule(configuration);
        services.AddMediaModule(configuration, isProduction);
        services.AddSupportModule(configuration);
        services.AddPurchasingModule(configuration);
        services.AddFinanceModule(configuration);
        services.AddScoped<Api.Finance.LedgerPoster>();
        services.AddScoped<Api.Finance.PartyDirectory>();
        services.AddScoped<Api.Pricing.PriceListService>();
        services.AddFiscalModule(configuration);
        services.AddInventoryModule(configuration);
        services.AddCheckoutModule(configuration);
        services.AddPaymentsModule(configuration);
        services.AddOrdersModule(configuration);
        services.AddAnalyticsModule(configuration);
        services.AddNotificationsModule(configuration);
        services.AddMercadoLibreModule(configuration);
        services.AddSocialModule(configuration);
        return services;
    }

    /// <summary>
    /// Integraciones y workers de polling. Workers:Enabled=false los apaga en
    /// réplicas extra de la API para que corran en UNA sola instancia y no
    /// procesen duplicado. Los workers de importación NO se apagan: su cola es
    /// en memoria y vive junto al request.
    /// </summary>
    public static IServiceCollection AddIntegrations(this IServiceCollection services, IConfiguration configuration)
    {
        var runPollingWorkers = configuration.GetValue("Workers:Enabled", true);

        // Webhooks de pago: inbox durable en DB + worker que hace polling con reintentos.
        if (runPollingWorkers) services.AddHostedService<PaymentWebhookWorker>();

        // Facturación automática: outbox de emisión + worker que pide el CAE a ARCA.
        if (runPollingWorkers) services.AddHostedService<Api.Fiscal.FiscalEmissionWorker>();

        // Emails transaccionales por Resend (dev: loguea). Plantillas editables por tenant.
        services.Configure<EmailOptions>(configuration.GetSection(EmailOptions.SectionName));
        services.AddHttpClient<IEmailSender, EmailSender>();
        services.AddScoped<OrderNotifier>();
        services.AddScoped<BrandedEmailSender>();
        services.AddScoped<OrderItemImages>();
        services.AddHttpClient<WhatsAppSender>();
        services.AddSingleton<WhatsAppTokenProtector>();
        services.AddScoped<WhatsAppNotifier>();

        // Correo Argentino (API MiCorreo): cotización en checkout + envíos desde admin.
        services.AddMemoryCache();
        services.AddHttpClient<Api.Shipping.MiCorreoClient>(c => c.Timeout = TimeSpan.FromSeconds(15));
        services.AddSingleton<Api.Shipping.ShippingSecretProtector>();
        // Zipnova: timeout corto y SIN retries (la creación de envíos no es idempotente).
        services.AddHttpClient<Api.Shipping.ZipnovaClient>(c => c.Timeout = TimeSpan.FromSeconds(20));
        // El timeout real lo pone cada operación: cotizar corta a los 6 s
        // porque está en el camino del checkout, despachar tolera 20.
        services.AddHttpClient<Api.Shipping.AndreaniClient>(c => c.Timeout = TimeSpan.FromSeconds(40));
        if (runPollingWorkers) services.AddHostedService<AbandonedCartWorker>();
        if (runPollingWorkers) services.AddHostedService<FavoriteAlertWorker>();
        if (runPollingWorkers) services.AddHostedService<CampaignWorker>();
        // Diseños programados (ej. una portada de Hot Sale que sale a las 00:00).
        if (runPollingWorkers) services.AddHostedService<Api.Workers.ThemeScheduleWorker>();
        services.AddScoped<CampaignAudienceService>();

        // Mercado Libre: OAuth por tienda, ventas/preguntas/mensajes en el panel,
        // stock unificado y publicación. Tokens cifrados; refresh serializado.
        services.Configure<Api.MetaAds.MetaAdsOptions>(configuration.GetSection(Api.MetaAds.MetaAdsOptions.SectionName));
        services.AddHttpClient<Api.MetaAds.MetaAdsClient>(c => c.Timeout = TimeSpan.FromSeconds(20));
        services.AddScoped<Api.MetaAds.MetaAdsTokenService>();
        services.AddScoped<Api.Orders.KitStockService>();
        services.AddScoped<Api.Crm.CustomerDirectory>();
        services.AddScoped<DemoDataSeeder>();   // datos de ejemplo; solo se usa desde /dev
        services.AddScoped<Api.Orders.PaidOrderSideEffects>();
        services.AddScoped<Api.Orders.ManualOrderService>();
        services.Configure<Api.Meli.MeliOptions>(configuration.GetSection(Api.Meli.MeliOptions.SectionName));
        services.AddHttpClient<Api.Meli.MeliClient>(c => c.Timeout = TimeSpan.FromSeconds(20));
        services.AddScoped<Api.Meli.MeliTokenService>();
        services.AddScoped<Api.Meli.MeliSyncService>();
        if (runPollingWorkers) services.AddHostedService<Api.Meli.MeliNotificationWorker>();
        if (runPollingWorkers) services.AddHostedService<Api.Meli.MeliStockSyncWorker>();

        // Redes sociales: OAuth por tienda (Meta, X) + Telegram por bot; posts
        // multi-red programados. Tokens cifrados; el worker publica cada minuto.
        services.Configure<Api.Social.SocialOptions>(configuration.GetSection(Api.Social.SocialOptions.SectionName));
        services.AddScoped<Api.Social.SocialTokenService>();
        services.AddHttpClient<Api.Social.MetaSocialConnector>(c => c.Timeout = TimeSpan.FromSeconds(20));
        services.AddScoped<Api.Social.ISocialConnector>(sp => sp.GetRequiredService<Api.Social.MetaSocialConnector>());
        services.AddHttpClient<Api.Social.MetaFacebookChannel>(c => c.Timeout = TimeSpan.FromSeconds(30));
        services.AddHttpClient<Api.Social.MetaInstagramChannel>(c => c.Timeout = TimeSpan.FromSeconds(30));
        services.AddHttpClient<Api.Social.XSocialChannel>(c => c.Timeout = TimeSpan.FromSeconds(20));
        services.AddScoped<Api.Social.ISocialConnector>(sp => sp.GetRequiredService<Api.Social.XSocialChannel>());
        services.AddHttpClient<Api.Social.TelegramChannel>(c => c.Timeout = TimeSpan.FromSeconds(20));
        services.AddScoped<Api.Social.ISocialChannel>(sp => sp.GetRequiredService<Api.Social.MetaFacebookChannel>());
        services.AddScoped<Api.Social.ISocialChannel>(sp => sp.GetRequiredService<Api.Social.MetaInstagramChannel>());
        services.AddScoped<Api.Social.ISocialChannel>(sp => sp.GetRequiredService<Api.Social.XSocialChannel>());
        services.AddScoped<Api.Social.ISocialChannel>(sp => sp.GetRequiredService<Api.Social.TelegramChannel>());
        if (runPollingWorkers) services.AddHostedService<Api.Social.SocialPublishWorker>();

        // Sugerencias con IA (Claude API). Vacío = apagado, botones ocultos.
        services.Configure<Api.Ai.AiOptions>(configuration.GetSection(Api.Ai.AiOptions.SectionName));
        // Leer una factura entera tarda más que redactar un párrafo: el timeout
        // del cliente tiene que aguantar el peor caso de un PDF escaneado.
        services.AddHttpClient<Api.Ai.AiClient>(c => c.Timeout = TimeSpan.FromSeconds(120));
        services.AddScoped<Api.Purchasing.InvoiceScanner>();

        // Captcha (Cloudflare Turnstile) para formularios públicos. Gated por config.
        services.AddHttpClient<Api.Captcha.ICaptchaVerifier, Api.Captcha.TurnstileVerifier>();

        return services;
    }

    /// <summary>
    /// Rate limiting: anti credential-stuffing / brute-force / spam. Particionado por IP.
    /// (En prod, UseForwardedHeaders hace que RemoteIpAddress sea la IP real del cliente.)
    /// </summary>
    public static IServiceCollection AddAppRateLimiting(
        this IServiceCollection services, IConfiguration? configuration = null)
    {
        // Los cupos son configurables SOLO para poder subirlos en el host de
        // tests: veinte casos de integración logueando desde la misma IP agotan
        // los 10 intentos legítimos y la suite falla por algo que en producción
        // es exactamente lo que se quiere. Los defaults son los valores de prod.
        var auth = configuration?.GetValue("RateLimiting:AuthPermitLimit", 10) ?? 10;
        var payments = configuration?.GetValue("RateLimiting:PaymentsPermitLimit", 15) ?? 15;
        var global = configuration?.GetValue("RateLimiting:GlobalPermitLimit", 300) ?? 300;

        // Ventana fija de 5 min por IP+ruta (cada ruta tiene su propio cupo).
        static RateLimitPartition<string> PerIpPerPath(HttpContext ctx, int permitLimit) =>
            RateLimitPartition.GetFixedWindowLimiter(
                $"{ctx.Connection.RemoteIpAddress}:{ctx.Request.Path}",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = permitLimit, Window = TimeSpan.FromMinutes(5), QueueLimit = 0 });

        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

            // Global: techo amplio contra agotamiento de recursos (DoS L7).
            options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx =>
                RateLimitPartition.GetFixedWindowLimiter(
                    ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                    _ => new FixedWindowRateLimiterOptions { PermitLimit = global, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));

            // Estricto para login/registro/contacto: 10 intentos cada 5 min, por IP Y por
            // endpoint (login no consume el cupo de coupon).
            options.AddPolicy("auth", ctx => PerIpPerPath(ctx, auth));

            // Pagos: frena card-testing (probar tarjetas robadas contra pay-onsite) sin
            // molestar a un comprador real. Por IP+ruta, más laxo que "auth".
            options.AddPolicy("payments", ctx => PerIpPerPath(ctx, payments));
        });
        return services;
    }

    /// <summary>
    /// Cifrado de secretos en reposo (tokens OAuth de MercadoPago, claves AFIP)
    /// y política Secure de la cookie de sesión en prod.
    /// </summary>
    public static WebApplicationBuilder AddSecretProtection(this WebApplicationBuilder builder)
    {
        // Dev: sin DataProtection:KeyPath → claves en %LOCALAPPDATA% (efímeras, ok local).
        // Prod: setear DataProtection__KeyPath a un volumen persistente (o KeyVault),
        // si no, los tokens MP encriptados se pierden al reiniciar.
        var dataProtection = builder.Services.AddDataProtection().SetApplicationName("tiendafy");
        var dpKeyPath = builder.Configuration["DataProtection:KeyPath"];
        if (!string.IsNullOrWhiteSpace(dpKeyPath))
            dataProtection.PersistKeysToFileSystem(new DirectoryInfo(dpKeyPath));
        else if (!builder.Environment.IsDevelopment())
            // Sin keyring persistente en prod, al reiniciar se pierden las claves y NO
            // se pueden descifrar los tokens de MercadoPago/WhatsApp ni la PII guardada:
            // fail-fast en vez de "desconectar" silenciosamente a todos los comercios.
            throw new InvalidOperationException(
                "DataProtection:KeyPath es obligatorio en Producción (volumen persistente o KeyVault). " +
                "Sin él, los tokens cifrados de los comercios se pierden al reiniciar.");

        // Prod: la cookie de sesión del admin solo viaja por HTTPS (Secure). En dev (http
        // localhost) queda SameAsRequest para no romper el login local.
        if (!builder.Environment.IsDevelopment())
            builder.Services.PostConfigure<CookieAuthenticationOptions>(IdentityConstants.ApplicationScheme,
                o => o.Cookie.SecurePolicy = CookieSecurePolicy.Always);
        return builder;
    }

    /// <summary>Tenant context, colas de importación en memoria y health checks.</summary>
    public static IServiceCollection AddAppCore(this IServiceCollection services)
    {
        services.AddScoped<TenantContextHolder>();
        services.AddScoped<ITenantContext>(sp => sp.GetRequiredService<TenantContextHolder>());

        // Importación masiva de productos: cola en memoria + worker en background.
        services.AddHttpClient();
        services.AddSingleton<ProductImportQueue>();
        services.AddHostedService<ProductImportWorker>();
        services.AddSingleton<ImageImportQueue>();
        services.AddHostedService<ProductImageImportWorker>();

        services
            .AddHealthChecks()
            .AddDbContextCheck<TenancyDbContext>("postgres");
        return services;
    }

    /// <summary>Documentación OpenAPI (spec en /openapi/v1.json, UI Scalar en /scalar).</summary>
    public static IServiceCollection AddApiDocs(this IServiceCollection services)
    {
        services.AddOpenApi(options =>
        {
            options.AddDocumentTransformer((doc, ctx, ct) =>
            {
                doc.Info.Title = "Tiendafy API";
                doc.Info.Version = "v1";
                doc.Info.Description =
                    "API multi-tenant de Tiendafy. Casi todos los endpoints requieren el header " +
                    "`X-Tenant-Id` (la tienda sobre la que se opera). Las escrituras de administración " +
                    "exigen además sesión por cookie (`tiendafy.session`) y membresía en esa tienda. " +
                    "Errores en formato RFC 7807 (problem+json): `title` = código, `detail` = mensaje.";
                return Task.CompletedTask;
            });
            // Tag automático por módulo (primer segmento después de /api/v1): agrupa las
            // 130+ rutas en secciones navegables en Scalar sin anotar endpoint por endpoint.
            options.AddOperationTransformer((op, ctx, ct) =>
            {
                var path = ctx.Description.RelativePath ?? string.Empty;
                var parts = path.Split('/', StringSplitOptions.RemoveEmptyEntries);
                var idx = Array.IndexOf(parts, "v1");
                var tag = idx >= 0 && parts.Length > idx + 1 ? parts[idx + 1] : (parts.FirstOrDefault() ?? "api");
                op.Tags ??= new HashSet<Microsoft.OpenApi.OpenApiTagReference>();
                op.Tags.Clear();
                op.Tags.Add(new Microsoft.OpenApi.OpenApiTagReference(tag, ctx.Document));
                return Task.CompletedTask;
            });
        });
        return services;
    }

    /// <summary>
    /// CORS: dev (localhost + *.localhost) + dominio de plataforma y sus
    /// subdominios (tiendas) + cualquier extra de Cors:AllowedOrigins.
    /// </summary>
    public static IServiceCollection AddAppCors(
        this IServiceCollection services, IConfiguration configuration, IHostEnvironment environment)
    {
        var platformDomain = (configuration["Tenancy:PlatformBaseDomain"] ?? "localhost").ToLowerInvariant();
        var extraOrigins = configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? Array.Empty<string>();
        var allowLocalhost = environment.IsDevelopment();
        services.AddCors(options =>
            options.AddDefaultPolicy(policy =>
                policy.SetIsOriginAllowed(origin =>
                    {
                        try
                        {
                            var host = new Uri(origin).Host.ToLowerInvariant();
                            // Dev local (solo en Development; en prod no se aceptan localhost).
                            if (allowLocalhost && (host == "localhost" || host.EndsWith(".localhost"))) return true;
                            // Dominio de plataforma + subdominios de tienda (mitienda.dominio).
                            if (host == platformDomain || host.EndsWith("." + platformDomain)) return true;
                            // Allowlist explícita (ej. dominios propios de merchants).
                            return extraOrigins.Any(o => string.Equals(o, origin, StringComparison.OrdinalIgnoreCase));
                        }
                        catch { return false; }
                    })
                    .AllowAnyHeader()
                    .AllowAnyMethod()
                    .AllowCredentials())); // cookie de sesión (admin) + bearer (shopper)
        return services;
    }
}
