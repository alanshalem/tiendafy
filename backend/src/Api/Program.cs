using System.Threading.RateLimiting;
using Analytics.Infrastructure;
using Api.Endpoints;
using Api.Import;
using Api.Middleware;
using Api.Notifications;
using Api.Payments;
using Api.Startup;
using Catalog.Infrastructure;
using Checkout.Infrastructure;
using Content.Infrastructure;
using Customers.Infrastructure;
using Discounts.Infrastructure;
using Fiscal.Infrastructure;
using Identity.Infrastructure;
using Inventory.Infrastructure;
using Media.Infrastructure;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Notifications.Infrastructure;
using Orders.Infrastructure;
using Payments.Infrastructure;
using Scalar.AspNetCore;
using Serilog;
using SharedKernel.Abstractions;
using Support.Infrastructure;
using Tenancy.Infrastructure;
using Tenancy.Infrastructure.Persistence;
using Themes.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

// Observabilidad: logging estructurado (Serilog) + error-tracking (Sentry, gated por DSN).
// Sin Sentry:Dsn, Sentry queda inerte. Serilog escribe JSON estructurado a stdout.
builder.Host.UseSerilog((ctx, cfg) => cfg
    .ReadFrom.Configuration(ctx.Configuration)
    .MinimumLevel.Information()
    .MinimumLevel.Override("Microsoft", Serilog.Events.LogEventLevel.Warning)
    .MinimumLevel.Override("Microsoft.EntityFrameworkCore", Serilog.Events.LogEventLevel.Warning)
    .Enrich.FromLogContext()
    .WriteTo.Console());
// DSN vacío = Sentry desactivado (sin DSN, UseSentry() tira ArgumentNullException).
builder.WebHost.UseSentry(o => o.Dsn = builder.Configuration["Sentry:Dsn"] ?? string.Empty);

builder.Services.AddTenancyModule(builder.Configuration);
builder.Services.AddIdentityModule(builder.Configuration);
builder.Services.AddCatalogModule(builder.Configuration);
builder.Services.AddDiscountsModule(builder.Configuration);
builder.Services.AddCustomersModule(builder.Configuration);
builder.Services.AddContentModule(builder.Configuration);
builder.Services.AddThemesModule(builder.Configuration);
builder.Services.AddMediaModule(builder.Configuration);
builder.Services.AddSupportModule(builder.Configuration);
builder.Services.AddFiscalModule(builder.Configuration);
builder.Services.AddInventoryModule(builder.Configuration);
builder.Services.AddCheckoutModule(builder.Configuration);
builder.Services.AddPaymentsModule(builder.Configuration);
builder.Services.AddOrdersModule(builder.Configuration);
builder.Services.AddAnalyticsModule(builder.Configuration);
builder.Services.AddNotificationsModule(builder.Configuration);

// Workers de background que hacen polling sobre la DB (webhooks, facturación,
// carritos). Workers:Enabled=false los apaga en réplicas extra de la API para
// que corran en UNA sola instancia y no procesen duplicado. Los workers de
// importación NO se apagan: su cola es en memoria y vive junto al request.
var runPollingWorkers = builder.Configuration.GetValue("Workers:Enabled", true);

// Webhooks de pago: inbox durable en DB + worker que hace polling con reintentos.
if (runPollingWorkers) builder.Services.AddHostedService<PaymentWebhookWorker>();

// Facturación automática: outbox de emisión + worker que pide el CAE a ARCA.
if (runPollingWorkers) builder.Services.AddHostedService<Api.Fiscal.FiscalEmissionWorker>();

// Emails transaccionales por Resend (dev: loguea). Plantillas editables por tenant.
builder.Services.Configure<EmailOptions>(builder.Configuration.GetSection(EmailOptions.SectionName));
builder.Services.AddHttpClient<IEmailSender, EmailSender>();
builder.Services.AddScoped<OrderNotifier>();
builder.Services.AddScoped<BrandedEmailSender>();
builder.Services.AddScoped<OrderItemImages>();
builder.Services.AddHttpClient<WhatsAppSender>();
builder.Services.AddSingleton<WhatsAppTokenProtector>();
builder.Services.AddScoped<WhatsAppNotifier>();

// Correo Argentino (API MiCorreo): cotización en checkout + envíos desde admin.
builder.Services.AddMemoryCache();
builder.Services.AddHttpClient<Api.Shipping.MiCorreoClient>(c => c.Timeout = TimeSpan.FromSeconds(15));
builder.Services.AddSingleton<Api.Shipping.CorreoSecretProtector>();
// Zipnova: timeout corto y SIN retries (la creación de envíos no es idempotente).
builder.Services.AddHttpClient<Api.Shipping.ZipnovaClient>(c => c.Timeout = TimeSpan.FromSeconds(20));
if (runPollingWorkers) builder.Services.AddHostedService<AbandonedCartWorker>();

// Captcha (Cloudflare Turnstile) para formularios públicos. Gated por config.
builder.Services.AddHttpClient<Api.Captcha.ICaptchaVerifier, Api.Captcha.TurnstileVerifier>();

// Rate limiting: anti credential-stuffing / brute-force / spam. Particionado por IP.
// (En prod, UseForwardedHeaders hace que RemoteIpAddress sea la IP real del cliente.)
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

    // Global: techo amplio contra agotamiento de recursos (DoS L7).
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx =>
        RateLimitPartition.GetFixedWindowLimiter(
            ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions { PermitLimit = 300, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));

    // Estricto para login/registro/contacto: 10 intentos cada 5 min, por IP Y por
    // endpoint (cada ruta tiene su propia ventana — login no consume el cupo de coupon).
    options.AddPolicy("auth", ctx =>
        RateLimitPartition.GetFixedWindowLimiter(
            $"{ctx.Connection.RemoteIpAddress}:{ctx.Request.Path}",
            _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(5), QueueLimit = 0 }));

    // Pagos: frena card-testing (probar tarjetas robadas contra pay-onsite) sin
    // molestar a un comprador real. Por IP+ruta, más laxo que "auth".
    options.AddPolicy("payments", ctx =>
        RateLimitPartition.GetFixedWindowLimiter(
            $"{ctx.Connection.RemoteIpAddress}:{ctx.Request.Path}",
            _ => new FixedWindowRateLimiterOptions { PermitLimit = 15, Window = TimeSpan.FromMinutes(5), QueueLimit = 0 }));
});

// Cifrado de secretos en reposo (tokens OAuth de MercadoPago, claves AFIP).
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

builder.Services.AddScoped<TenantContextHolder>();
builder.Services.AddScoped<ITenantContext>(sp => sp.GetRequiredService<TenantContextHolder>());

// Importación masiva de productos: cola en memoria + worker en background.
builder.Services.AddHttpClient();
builder.Services.AddSingleton<ProductImportQueue>();
builder.Services.AddHostedService<ProductImportWorker>();
builder.Services.AddSingleton<ImageImportQueue>();
builder.Services.AddHostedService<ProductImageImportWorker>();

builder.Services
    .AddHealthChecks()
    .AddDbContextCheck<TenancyDbContext>("postgres");

// Documentación OpenAPI (spec en /openapi/v1.json, UI Scalar en /scalar).
builder.Services.AddOpenApi(options =>
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

// Orígenes permitidos: dev (localhost + *.localhost) + dominio de plataforma y
// sus subdominios (tiendas) + cualquier extra de Cors:AllowedOrigins.
var platformDomain = (builder.Configuration["Tenancy:PlatformBaseDomain"] ?? "localhost").ToLowerInvariant();
var extraOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? Array.Empty<string>();
var allowLocalhost = builder.Environment.IsDevelopment();
builder.Services.AddCors(options =>
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

var app = builder.Build();

// PII de clientes (teléfono/dirección) cifrada en reposo con DataProtection.
// Debe quedar seteado antes de construir el modelo EF / migrar.
Customers.Infrastructure.CustomersDbContext.UsePii(
    app.Services.GetRequiredService<Microsoft.AspNetCore.DataProtection.IDataProtectionProvider>());

// Prod: detrás de un reverse proxy/ingress que termina TLS. Confiamos en
// X-Forwarded-* para conocer el esquema/host reales + HSTS. El redirect a HTTPS
// lo hace el proxy (no la app, para evitar loops).
if (!app.Environment.IsDevelopment())
{
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
    foreach (var cidr in builder.Configuration.GetSection("ForwardedHeaders:KnownNetworks").Get<string[]>() ?? [])
        if (System.Net.IPNetwork.TryParse(cidr, out var net))
            fwd.KnownIPNetworks.Add(net);
    app.UseForwardedHeaders(fwd);
    app.UseHsts();
}

// Modo one-shot para deploys: `dotnet Api.dll migrate` aplica las migraciones de
// TODOS los módulos y sale con código 0. Es el paso de deploy explícito (antes
// del up -d) que evita la carrera de migración entre réplicas al bootear.
if (args.Contains("migrate"))
{
    await app.Services.MigrateDatabaseAsync();
    app.Logger.LogInformation("Migraciones aplicadas (modo migrate). Saliendo.");
    return;
}

// Migraciones pendientes de todos los módulos, antes de servir (idempotente).
// Prod multi-instancia: poné Database__MigrateOnStartup=false y corré las
// migraciones como paso de deploy (evita carreras de migración al boot).
if (builder.Configuration.GetValue("Database:MigrateOnStartup", true))
    await app.Services.MigrateDatabaseAsync();
else
    app.Logger.LogInformation("Migraciones en startup desactivadas (Database:MigrateOnStartup=false).");

// Bucket de media listo antes de servir (idempotente). Apagable por config
// (tests de integración corren sin MinIO).
if (builder.Configuration.GetValue("Media:EnsureBucketOnStartup", true))
    await app.Services.EnsureMediaBucketAsync();

// Dev: admin de prueba (con membresía a todas las tiendas) + compradores.
if (app.Environment.IsDevelopment())
{
    await app.Services.SeedDevAdminAsync();
    await app.Services.SeedTestShoppersAsync();
}

// Docs de la API solo en Development (spec + UI navegable).
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference(options => options
        .WithTitle("Tiendafy API")
        .WithTheme(ScalarTheme.Purple));
}

app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.UseMiddleware<TenantContextMiddleware>();
// Aislamiento multi-tenant: toda escritura admin requiere sesión + membresía.
app.UseMiddleware<AdminWriteAuthMiddleware>();

app.MapHealthChecks("/health");

// Qué build corre en este server: sha de git horneado en la imagen + entorno.
var gitSha = Environment.GetEnvironmentVariable("APP_GIT_SHA") ?? "dev";
app.MapGet("/version", (IHostEnvironment env) => Results.Ok(new { sha = gitSha, environment = env.EnvironmentName }));

var apiV1 = app.MapGroup("/api/v1");
apiV1.MapTenantEndpoints();
apiV1.MapAuthEndpoints();
apiV1.MapProductEndpoints();
apiV1.MapCategoryEndpoints();
apiV1.MapDiscountsEndpoints();
apiV1.MapCustomerEndpoints();
apiV1.MapPageEndpoints();
apiV1.MapStatsEndpoints();
apiV1.MapThemeEndpoints();
apiV1.MapMediaEndpoints();
apiV1.MapSupportEndpoints();
apiV1.MapFiscalEndpoints();
apiV1.MapWhatsAppEndpoints();
apiV1.MapInventoryEndpoints();
apiV1.MapCheckoutEndpoints();
apiV1.MapShippingEndpoints();
apiV1.MapCorreoArgentinoEndpoints();
apiV1.MapZipnovaEndpoints();
apiV1.MapPaymentsEndpoints();
apiV1.MapOrderEndpoints();
apiV1.MapPaymentWebhookEndpoints();
apiV1.MapTrackEndpoints();
apiV1.MapEmailTemplateEndpoints();
apiV1.MapShopAuthEndpoints();
apiV1.MapShopFavoritesEndpoints();
apiV1.MapShopOrdersEndpoints();
apiV1.MapContactEndpoints();
apiV1.MapMembersEndpoints();

app.Run();

// Visible para WebApplicationFactory<Program> (tests de integración).
public partial class Program { }
