using System.Threading.RateLimiting;
using Ai.Infrastructure;
using Analytics.Infrastructure;
using Api.Import;
using Api.Middleware;
using Api.Notifications;
using Api.Payments;
using Api.Stats;
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
using Reviews.Infrastructure;
using Serilog;
using SharedKernel.Abstractions;
using Social.Contracts;
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
        // El scrubber tapa los secretos que viajan en URLs (token del bot de
        // Telegram, access_token de Meta, links firmados) antes de mandar nada.
        builder.WebHost.UseSentry(o =>
        {
            o.Dsn = builder.Configuration["Sentry:Dsn"] ?? string.Empty;
            SentryScrubber.Configure(o);
        });
        return builder;
    }

    /// <summary>Los módulos del monolito.</summary>
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
        services.AddReviewsModule(configuration);
        services.AddAiModule(configuration);
        services.AddPurchasingModule(configuration);
        services.AddFinanceModule(configuration);
        services.AddScoped<Api.Finance.LedgerPoster>();
        services.AddScoped<Api.Finance.PartyDirectory>();
        services.AddScoped<Api.Pricing.PriceListService>();
        services.AddStatsQueries();
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

        // Payway no avisa: los cobros que quedaron en el medio se reconsultan.
        services.AddScoped<PaywayReconciliationService>();
        if (runPollingWorkers) services.AddHostedService<PaywayReconciliationWorker>();

        // Ventas de pasarela que nadie pagó (Checkout Pro o Brick abandonado,
        // Payway sin resolver): se cancelan solas, sin avisarle al comprador.
        services.AddScoped<AbandonedPaymentService>();
        if (runPollingWorkers) services.AddHostedService<AbandonedPaymentWorker>();

        // Facturación automática: outbox de emisión + worker que pide el CAE a ARCA.
        if (runPollingWorkers) services.AddHostedService<Api.Fiscal.FiscalEmissionWorker>();

        // Emails transaccionales por Resend (dev: loguea). Plantillas editables por tenant.
        services.Configure<EmailOptions>(configuration.GetSection(EmailOptions.SectionName));
        services.AddHttpClient<IEmailSender, EmailSender>();
        services.AddScoped<OrderNotifier>();
        services.AddScoped<ShopperAccountEmails>();
        services.AddScoped<Api.Fiscal.InvoiceEmail>();
        services.AddScoped<Api.Fiscal.CreditNoteIssuer>();
        services.AddScoped<StoreLinks>();
        services.AddScoped<BrandedEmailSender>();
        services.AddScoped<OrderItemImages>();
        services.AddHttpClient<WhatsAppSender>();
        services.AddSingleton<WhatsAppTokenProtector>();
        services.AddScoped<WhatsAppNotifier>();

        // Los carriers (MiCorreo, Zipnova, Andreani) los registra su módulo: AddCheckoutModule.
        if (runPollingWorkers) services.AddHostedService<AbandonedCartWorker>();
        if (runPollingWorkers) services.AddHostedService<FavoriteAlertWorker>();
        // "Avisame cuando ingrese" y el pedido de reseña unos días después del despacho.
        if (runPollingWorkers) services.AddHostedService<BackInStockWorker>();
        if (runPollingWorkers) services.AddHostedService<ReviewRequestWorker>();
        if (runPollingWorkers) services.AddHostedService<CampaignWorker>();
        // Diseños programados (ej. una portada de Hot Sale que sale a las 00:00).
        if (runPollingWorkers) services.AddHostedService<Api.Workers.ThemeScheduleWorker>();
        if (runPollingWorkers) services.AddHostedService<Api.Orders.OfflinePaymentExpiryWorker>();
        // Checkouts con el plazo cumplido: vencidos (o completados si terminaron en venta).
        if (runPollingWorkers) services.AddHostedService<Api.Orders.ExpiredCheckoutWorker>();
        services.AddScoped<CampaignAudienceService>();

        // Meta Ads: gasto de pauta por campaña para el ROAS real de Rentabilidad.
        services.Configure<Api.MetaAds.MetaAdsOptions>(configuration.GetSection(Api.MetaAds.MetaAdsOptions.SectionName));
        // Meta lleva access_token y client_secret en la query: sin URL en los logs.
        services.AddHttpClient<Api.MetaAds.MetaAdsClient>(c => c.Timeout = TimeSpan.FromSeconds(20)).WithoutUrlInLogs();
        services.AddScoped<Api.MetaAds.MetaAdsTokenService>();
        services.AddScoped<Api.Orders.KitStockService>();
        services.AddScoped<Api.Crm.CustomerDirectory>();
        services.AddScoped<DemoDataSeeder>();   // datos de ejemplo; solo se usa desde /dev
        services.AddScoped<Api.Orders.CheckoutOrderFactory>();
        services.AddScoped<Api.Orders.PaidOrderSideEffects>();
        services.AddScoped<Api.Orders.RefundedOrderSideEffects>();
        services.AddScoped<Api.Orders.OrderRefundService>();
        services.AddSingleton<Api.Orders.OrderRefundLocks>(); // una por proceso: es lo que serializa
        services.AddScoped<Api.Orders.OrderFulfillment>();
        services.AddScoped<Api.Orders.OrderTrackingView>();
        services.AddScoped<Api.Orders.ManualOrderService>();
        services.AddScoped<Api.Orders.OfflinePaymentService>();
        services.AddSingleton<Api.Auth.IGoogleIdTokenValidator, Api.Auth.GoogleIdTokenValidator>(); // login de compradores con Google
        // Mercado Libre: OAuth por tienda, ventas/preguntas/mensajes en el panel,
        // stock unificado y publicación. Tokens cifrados; refresh serializado.
        // MeliOptions y MeliClient los registra su módulo: AddMercadoLibreModule.
        services.AddScoped<Api.Meli.MeliTokenService>();
        // De a una llamada por tienda y espera ante el 429 (lo usa el trabajo de fichas con IA).
        services.AddSingleton<Api.Meli.MeliWait>(_ => (delay, ct) => Task.Delay(delay, ct));
        services.AddSingleton<Api.Meli.MeliTenantGate>();
        services.AddScoped<Api.Meli.MeliCatalogReader>();
        services.AddScoped<Api.Meli.MeliSyncService>();
        if (runPollingWorkers) services.AddHostedService<Api.Meli.MeliNotificationWorker>();
        if (runPollingWorkers) services.AddHostedService<Api.Meli.MeliStockSyncWorker>();

        // Redes sociales: OAuth por tienda (Meta, X) + Telegram por bot; posts
        // multi-red programados. Tokens cifrados; el worker publica cada minuto.
        // Meta (token en la query) y Telegram (token del bot en el path) no
        // dejan la URL en los logs: ver SecretUrlHttpLogging.
        services.Configure<Api.Social.SocialOptions>(configuration.GetSection(Api.Social.SocialOptions.SectionName));
        services.AddScoped<Api.Social.SocialTokenService>();
        services.AddScoped<Api.Social.SocialAccountTokens>();
        services.AddHttpClient<Api.Social.MetaSocialConnector>(c => c.Timeout = TimeSpan.FromSeconds(20)).WithoutUrlInLogs();
        services.AddScoped<ISocialConnector>(sp => sp.GetRequiredService<Api.Social.MetaSocialConnector>());
        services.AddHttpClient<Api.Social.MetaFacebookChannel>(c => c.Timeout = TimeSpan.FromSeconds(30)).WithoutUrlInLogs();
        services.AddHttpClient<Api.Social.MetaInstagramChannel>(c => c.Timeout = TimeSpan.FromSeconds(30)).WithoutUrlInLogs();
        services.AddHttpClient<Api.Social.XSocialChannel>(c => c.Timeout = TimeSpan.FromSeconds(20));
        services.AddScoped<ISocialConnector>(sp => sp.GetRequiredService<Api.Social.XSocialChannel>());
        services.AddHttpClient<Api.Social.TelegramChannel>(c => c.Timeout = TimeSpan.FromSeconds(20)).WithoutUrlInLogs();
        services.AddScoped<ISocialChannel>(sp => sp.GetRequiredService<Api.Social.MetaFacebookChannel>());
        services.AddScoped<ISocialChannel>(sp => sp.GetRequiredService<Api.Social.MetaInstagramChannel>());
        services.AddScoped<ISocialChannel>(sp => sp.GetRequiredService<Api.Social.XSocialChannel>());
        services.AddScoped<ISocialChannel>(sp => sp.GetRequiredService<Api.Social.TelegramChannel>());
        if (runPollingWorkers) services.AddHostedService<Api.Social.SocialPublishWorker>();

        // IA: todo pasa por el gateway (modelos y claves por tienda, ver Api/Ai).
        services.AddSingleton<Api.Ai.IAiChatClientFactory, Api.Ai.AiChatClientFactory>();
        Microsoft.Extensions.DependencyInjection.Extensions.ServiceCollectionDescriptorExtensions.TryAddSingleton(services, TimeProvider.System);
        services.AddSingleton<Api.Ai.IAiMonthSpend, Api.Ai.AiMonthSpend>();
        services.AddSingleton<Api.Ai.AiBudget>();
        services.AddSingleton<Api.Ai.IAiUsageRecorder, Api.Ai.AiUsageRecorder>();
        // Gateway de IA. Singletons: el corte por fallas (estado en memoria, una sola instancia de API)
        // y el cifrado de claves (sin estado). Scoped: la configuración de la tienda (usa el AiDbContext
        // del scope) y el gateway (toma la tienda y el usuario del request).
        services.AddHttpContextAccessor();
        services.AddSingleton<Api.Ai.AiCircuitBreaker>();
        services.AddSingleton<Api.Ai.AiConcurrency>();
        services.AddSingleton<Api.Ai.AiRateLimiter>();
        services.AddSingleton<Api.Ai.IAiKeyProtector, Api.Ai.AiKeyProtector>();
        services.AddScoped<Api.Ai.IAiTenantConfig, Api.Ai.AiTenantConfig>();
        services.AddScoped<Api.Ai.IAiGateway, Api.Ai.AiGateway>();
        services.AddScoped<Api.Ai.AiConfigService>();
        services.AddScoped<Api.Ai.AiUsageQueries>();
        services.AddScoped<Api.Purchasing.InvoiceScanner>();

        // Bandeja unificada (contacto + posventa + preguntas y mensajes de ML).
        // El cache en memoria ahorra llamadas a ML: la bandeja y el contador
        // del menú se refrescan solos desde cada panel abierto.
        services.AddMemoryCache();
        services.AddScoped<Api.Inbox.MeliInboxSource>();
        Api.Ai.Questions.QuestionDraftsRegistration.AddQuestionDrafts(services);
        Api.Ai.Assistant.AssistantRegistration.AddAssistant(services);
        services.AddScoped<Api.Inbox.InboxService>();

        // Despacho: cola de pedidos, lista de picking, etiquetas en lote y
        // despachar escaneando.
        services.AddScoped<Api.Fulfillment.FulfillmentService>();
        services.AddScoped<Api.Fulfillment.CarrierLabels>();

        // Alertas de stock bajo: la misma señal de reposición de Compras, un
        // aviso por cruce (inmediato o en un resumen diario).
        services.AddScoped<Api.Purchasing.ReorderSignal>();
        services.AddScoped<Api.Purchasing.StockAlertService>();
        if (runPollingWorkers) services.AddHostedService<Api.Purchasing.StockAlertWorker>();

        // Captcha (Cloudflare Turnstile) para formularios públicos. Gated por config.
        services.AddHttpClient<Api.Captcha.ICaptchaVerifier, Api.Captcha.TurnstileVerifier>();

        // Aviso al storefront para que vence su caché al publicar un diseño o
        // cambiar el catálogo. Vacío = apagado (la tienda vence sola por tiempo).
        services.Configure<Api.Storefront.StorefrontOptions>(configuration.GetSection(Api.Storefront.StorefrontOptions.SectionName));
        services.AddHttpClient(Api.Storefront.StorefrontRevalidator.HttpClientName,
            c => c.Timeout = Api.Storefront.StorefrontRevalidator.Timeout);
        services.AddSingleton<Api.Storefront.IStorefrontRevalidator, Api.Storefront.StorefrontRevalidator>();

        return services;
    }

    /// <summary>
    /// El 429 de la API: Retry-After (si se sabe) y cuerpo RFC 7807 en castellano. Lo usan el
    /// limitador global y los filtros de cupo por endpoint, para que todos respondan igual.
    /// </summary>
    public static IResult RateLimitExceeded(HttpContext http, TimeSpan? retryAfter)
    {
        if (retryAfter is { } wait)
        {
            http.Response.Headers.RetryAfter =
                ((int)Math.Ceiling(wait.TotalSeconds)).ToString(System.Globalization.CultureInfo.InvariantCulture);
        }

        return Results.Problem(
            title: "RateLimit.Exceeded",
            detail: "Demasiados intentos seguidos. Esperá unos minutos y probá de nuevo.",
            statusCode: StatusCodes.Status429TooManyRequests);
    }

    /// <summary>
    /// Rate limiting: anti credential-stuffing / brute-force / spam. Particionado por IP.
    /// (En prod, UseForwardedHeaders hace que RemoteIpAddress sea la IP real del cliente.)
    /// </summary>
    public static IServiceCollection AddAppRateLimiting(
        this IServiceCollection services, IConfiguration? configuration = null)
    {
        // Los cupos son configurables para poder subirlos donde todo llega desde
        // la misma IP: el host de tests (veinte casos logueando agotan los 10
        // intentos legítimos) y desarrollo (navegador, storefront y e2e desde
        // 127.0.0.1). Los defaults son los valores de prod.
        var auth = configuration?.GetValue("RateLimiting:AuthPermitLimit", 10) ?? 10;
        var payments = configuration?.GetValue("RateLimiting:PaymentsPermitLimit", 15) ?? 15;
        var checkoutContact = configuration?.GetValue("RateLimiting:CheckoutContactPermitLimit", 30) ?? 30;
        var global = configuration?.GetValue("RateLimiting:GlobalPermitLimit", 300) ?? 300;

        // Ventana fija de 5 min por IP+ruta (cada ruta tiene su propio cupo).
        static RateLimitPartition<string> PerIpPerPath(HttpContext ctx, int permitLimit) =>
            RateLimitPartition.GetFixedWindowLimiter(
                $"{ctx.Connection.RemoteIpAddress}:{ctx.Request.Path}",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = permitLimit, Window = TimeSpan.FromMinutes(5), QueueLimit = 0 });

        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

            // Sin esto el 429 salía sin cuerpo, y el panel le mostraba a quien se
            // equivocó de contraseña "Request failed with status 429". Se
            // responde como todo error de la API (RFC 7807), en castellano y
            // diciendo cuándo volver a probar.
            options.OnRejected = async (context, ct) =>
            {
                TimeSpan? after = context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter) ? retryAfter : null;
                await RateLimitExceeded(context.HttpContext, after).ExecuteAsync(context.HttpContext);
            };

            // Global: techo amplio contra agotamiento de recursos (DoS L7), por
            // cliente real. Nuestros servidores en la red interna (el storefront
            // armando páginas) no tienen techo: son todos los compradores juntos.
            var internalNetworks = TrustedNetworks.From(configuration);
            options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx =>
                TrustedNetworks.GlobalPartition(ctx, internalNetworks, global));

            // Estricto para login/registro/contacto: 10 intentos cada 5 min, por IP Y por
            // endpoint (login no consume el cupo de coupon).
            options.AddPolicy("auth", ctx => PerIpPerPath(ctx, auth));

            // Pagos: frena card-testing (probar tarjetas robadas contra pay-onsite) sin
            // molestar a un comprador real. Por IP+ruta, más laxo que "auth".
            options.AddPolicy("payments", ctx => PerIpPerPath(ctx, payments));

            // Datos de contacto del checkout: guarda un email y le manda el
            // recordatorio de carrito abandonado, así que sin cupo alguien
            // podría cargar emails ajenos en masa. Más laxo que "payments": un
            // comprador real lo llama varias veces (email, nombre, teléfono, el
            // aviso por WhatsApp y al pagar), y si se agota no puede pagar.
            options.AddPolicy("checkout-contact", ctx => PerIpPerPath(ctx, checkoutContact));
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
        // Descargas de URLs ajenas (imágenes del CSV): sin redirecciones y con la IP validada al conectar.
        services.AddHttpClient(Api.Import.PublicUrlGuard.HttpClientName)
            .ConfigurePrimaryHttpMessageHandler(Api.Import.PublicUrlGuard.CreateHandler);
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
        var platformDomain = StoreLinks.PlatformDomainOf(configuration);
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
