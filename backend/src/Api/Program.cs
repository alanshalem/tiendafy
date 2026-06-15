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
using Media.Infrastructure;
using Microsoft.AspNetCore.DataProtection;
using Payments.Infrastructure;
using Scalar.AspNetCore;
using SharedKernel.Abstractions;
using Tenancy.Infrastructure;
using Tenancy.Infrastructure.Persistence;
using Themes.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

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

// Cifrado de secretos en reposo (tokens OAuth de MercadoPago, claves AFIP).
// Dev: claves en %LOCALAPPDATA%. Prod: persistir el keyring (DB/Redis/KeyVault).
builder.Services.AddDataProtection().SetApplicationName("tiendafy");

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

// Dev: admin (3001) y storefront (3000) llaman a la API desde el browser.
// Prod: restringir a dominios reales de plataforma.
builder.Services.AddCors(options =>
    options.AddDefaultPolicy(policy =>
        policy.SetIsOriginAllowed(origin =>
            {
                // Admin (:3001), storefront raíz (:3000) y cualquier subdominio
                // de tienda (*.localhost:3000) para el preview del editor.
                try
                {
                    var host = new Uri(origin).Host;
                    return host == "localhost" || host.EndsWith(".localhost");
                }
                catch { return false; }
            })
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials())); // cookie de sesión cross-origin (admin :3001)

var app = builder.Build();

// Migraciones pendientes de todos los módulos, antes de servir (idempotente).
await app.Services.MigrateDatabaseAsync();

// Bucket de media listo antes de servir (idempotente).
await app.Services.EnsureMediaBucketAsync();

// Docs de la API solo en Development (spec + UI navegable).
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference(options => options
        .WithTitle("Tiendafy API")
        .WithTheme(ScalarTheme.Purple));
}

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.UseMiddleware<TenantContextMiddleware>();

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

app.Run();
