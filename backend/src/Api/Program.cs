using Api.Endpoints;
using Api.Import;
using Api.Middleware;
using Api.Startup;
using Catalog.Infrastructure;
using Checkout.Infrastructure;
using Content.Infrastructure;
using Customers.Infrastructure;
using Discounts.Infrastructure;
using Identity.Infrastructure;
using Inventory.Infrastructure;
using Analytics.Infrastructure;
using Api.Notifications;
using Api.Payments;
using Media.Infrastructure;
using System.Threading.RateLimiting;
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
builder.Services.AddInventoryModule(builder.Configuration);
builder.Services.AddCheckoutModule(builder.Configuration);
builder.Services.AddPaymentsModule(builder.Configuration);
builder.Services.AddOrdersModule(builder.Configuration);
builder.Services.AddAnalyticsModule(builder.Configuration);
builder.Services.AddNotificationsModule(builder.Configuration);

// Webhooks de pago: inbox durable en DB + worker que hace polling con reintentos.
builder.Services.AddHostedService<PaymentWebhookWorker>();

// Emails transaccionales por Resend (dev: loguea). Plantillas editables por tenant.
builder.Services.Configure<EmailOptions>(builder.Configuration.GetSection(EmailOptions.SectionName));
builder.Services.AddHttpClient<IEmailSender, EmailSender>();
builder.Services.AddScoped<OrderPaidNotifier>();
builder.Services.AddScoped<OrderNotifier>();
builder.Services.AddHostedService<AbandonedCartWorker>();

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
});

// Cifrado de secretos en reposo (tokens OAuth de MercadoPago, claves AFIP).
// Dev: sin DataProtection:KeyPath → claves en %LOCALAPPDATA% (efímeras, ok local).
// Prod: setear DataProtection__KeyPath a un volumen persistente (o KeyVault),
// si no, los tokens MP encriptados se pierden al reiniciar.
var dataProtection = builder.Services.AddDataProtection().SetApplicationName("tiendafy");
var dpKeyPath = builder.Configuration["DataProtection:KeyPath"];
if (!string.IsNullOrWhiteSpace(dpKeyPath))
    dataProtection.PersistKeysToFileSystem(new DirectoryInfo(dpKeyPath));

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
builder.Services.AddOpenApi();

// Orígenes permitidos: dev (localhost + *.localhost) + dominio de plataforma y
// sus subdominios (tiendas) + cualquier extra de Cors:AllowedOrigins.
var platformDomain = (builder.Configuration["Tenancy:PlatformBaseDomain"] ?? "localhost").ToLowerInvariant();
var extraOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? Array.Empty<string>();
builder.Services.AddCors(options =>
    options.AddDefaultPolicy(policy =>
        policy.SetIsOriginAllowed(origin =>
            {
                try
                {
                    var host = new Uri(origin).Host.ToLowerInvariant();
                    // Dev local.
                    if (host == "localhost" || host.EndsWith(".localhost")) return true;
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
    app.UseForwardedHeaders(new ForwardedHeadersOptions
    {
        ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto,
    });
    app.UseHsts();
}

// Migraciones pendientes de todos los módulos, antes de servir (idempotente).
// Prod multi-instancia: poné Database__MigrateOnStartup=false y corré las
// migraciones como paso de deploy (evita carreras de migración al boot).
if (builder.Configuration.GetValue("Database:MigrateOnStartup", true))
    await app.Services.MigrateDatabaseAsync();
else
    app.Logger.LogInformation("Migraciones en startup desactivadas (Database:MigrateOnStartup=false).");

// Bucket de media listo antes de servir (idempotente).
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
apiV1.MapInventoryEndpoints();
apiV1.MapCheckoutEndpoints();
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
