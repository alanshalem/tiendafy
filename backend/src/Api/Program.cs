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

var app = builder.Build();

// PII de clientes (teléfono/dirección) cifrada en reposo con DataProtection.
// Debe quedar seteado antes de construir el modelo EF / migrar.
Customers.Infrastructure.CustomersDbContext.UsePii(
    app.Services.GetRequiredService<Microsoft.AspNetCore.DataProtection.IDataProtectionProvider>());

app.UseProxyHeaders();

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
