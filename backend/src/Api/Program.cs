using Api.Middleware;
using Api.Startup;
using Media.Infrastructure;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

builder.AddObservability();
builder.Services.AddAllModules(builder.Configuration, builder.Environment.IsProduction());
builder.Services.AddIntegrations(builder.Configuration);
builder.Services.AddAppRateLimiting(builder.Configuration);
builder.AddSecretProtection();
builder.Services.AddAppCore();
builder.Services.AddApiDocs();
builder.Services.AddAppCors(builder.Configuration, builder.Environment);
builder.Services.AddAppResponseCompression();

var app = builder.Build();

// PII cifrada en reposo con DataProtection: la de los clientes, la del
// comprador en ventas y checkouts (teléfono, documento, dirección) y su
// documento en los comprobantes fiscales.
// Debe quedar seteado antes de construir el modelo EF / migrar.
var dataProtection = app.Services.GetRequiredService<Microsoft.AspNetCore.DataProtection.IDataProtectionProvider>();
Customers.Infrastructure.CustomersDbContext.UsePii(dataProtection);
Orders.Infrastructure.Persistence.OrdersDbContext.UsePii(dataProtection);
Checkout.Infrastructure.Persistence.CheckoutDbContext.UsePii(dataProtection);
Fiscal.Infrastructure.Persistence.FiscalDbContext.UsePii(dataProtection);

app.UseProxyHeaders();
app.UseMiddleware<SecurityHeadersMiddleware>();

// Modo one-shot para deploys: `dotnet Api.dll migrate` aplica las migraciones de
// TODOS los módulos y sale con código 0. Es el paso de deploy explícito (antes
// del up -d) que evita la carrera de migración entre réplicas al bootear.
if (args.Contains("migrate"))
{
    await app.Services.MigrateDatabaseAsync();
    app.Logger.LogInformation("Migraciones aplicadas (modo migrate). Saliendo.");
    return;
}

// Mantenimiento, una sola vez después del deploy que cambió el sanitizador de
// SVG: `dotnet Api.dll resanitize-svg` re-sanea los .svg que ya estaban en el
// bucket público y los vuelve a subir con Content-Disposition: attachment.
// Idempotente (ver SvgResanitizer y docs/despliegue.md).
if (args.Contains("resanitize-svg"))
{
    var report = await app.Services.GetRequiredService<SvgResanitizer>().RunAsync();
    app.Logger.LogInformation("SVG re-saneados: {Report}. Saliendo.", report);
    return;
}

// Migraciones pendientes de todos los módulos, antes de servir (idempotente).
// Prod multi-instancia: poné Database__MigrateOnStartup=false y corré las
// migraciones como paso de deploy (evita carreras de migración al boot).
if (app.Configuration.GetValue("Database:MigrateOnStartup", true))
    await app.Services.MigrateDatabaseAsync();
else
    app.Logger.LogInformation("Migraciones en startup desactivadas (Database:MigrateOnStartup=false).");

// Bucket de media listo antes de servir (idempotente). Apagable por config
// (tests de integración corren sin MinIO).
if (app.Configuration.GetValue("Media:EnsureBucketOnStartup", true))
    await app.Services.EnsureMediaBucketAsync();

if (app.Environment.IsDevelopment())
{
    // Admin de prueba (con membresía a todas las tiendas) + compradores seed.
    await app.Services.SeedDevAdminAsync();
    await app.Services.SeedTestShoppersAsync();

    // Docs de la API solo en Development (spec + UI navegable).
    app.MapOpenApi();
    app.MapScalarApiReference(options => options
        .WithTitle("Tiendafy API")
        .WithTheme(ScalarTheme.Purple));
}

// Antes que todo lo que escribe respuestas (también los 429 del rate limiter
// y los problem+json de los middlewares de tenant/permisos).
app.UseResponseCompression();
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

app.MapApiV1();

app.Run();

// Visible para WebApplicationFactory<Program> (tests de integración).
public partial class Program { }
