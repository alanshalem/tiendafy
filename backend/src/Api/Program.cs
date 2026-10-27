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

// Mantenimiento: `dotnet Api.dll reset-2fa <email>` borra la verificación en
// dos pasos de alguien del panel que perdió el teléfono y los códigos de
// recuperación (ver PanelTwoFactorReset y docs/despliegue.md). El log no
// repite el email (los logs van a Sentry).
var resetTwoFactorAt = Array.IndexOf(args, Api.Auth.PanelTwoFactorReset.Command);
if (resetTwoFactorAt >= 0)
{
    var email = args.ElementAtOrDefault(resetTwoFactorAt + 1);
    if (string.IsNullOrWhiteSpace(email))
    {
        app.Logger.LogError("Falta el email: dotnet Api.dll reset-2fa <email>");
        Environment.ExitCode = 1;
        return;
    }
    var outcome = await Api.Auth.PanelTwoFactorReset.RunAsync(app.Services, email);
    switch (outcome)
    {
        case Api.Auth.TwoFactorResetOutcome.Reset:
            app.Logger.LogInformation("Verificación en dos pasos borrada: esa persona la vuelve a configurar al entrar. Saliendo.");
            break;
        case Api.Auth.TwoFactorResetOutcome.NotEnabled:
            app.Logger.LogInformation("Esa cuenta no tenía verificación en dos pasos (igual se desbloqueó y se cerraron sus sesiones). Saliendo.");
            break;
        default:
            app.Logger.LogError("No hay una cuenta del panel con ese email.");
            Environment.ExitCode = 1;
            break;
    }
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
// Dueños y administradores sin la verificación en dos pasos: 403 hasta configurarla.
app.UseMiddleware<TwoFactorSetupMiddleware>();
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
