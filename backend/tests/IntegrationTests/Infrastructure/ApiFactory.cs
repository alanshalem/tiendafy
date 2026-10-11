using Microsoft.AspNetCore.Mvc.Testing;

namespace IntegrationTests;

/// <summary>
/// La API real, contra Postgres, para todos los tests de integración. Usa una
/// base propia (tiendafy_itests, o TIENDAFY_TEST_DB) que migra al arrancar.
/// </summary>
public sealed class ApiFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder)
    {
        builder.UseSetting("ConnectionStrings:Default",
            Environment.GetEnvironmentVariable("TIENDAFY_TEST_DB")
            ?? "Host=localhost;Port=5432;Database=tiendafy_itests;Username=tiendafy;Password=tiendafy");
        builder.UseSetting("Database:MigrateOnStartup", "true");
        builder.UseSetting("Media:EnsureBucketOnStartup", "false"); // sin MinIO en tests
        builder.UseSetting("Workers:Enabled", "false");             // sin background workers
        // Todos los tests loguean desde la misma IP: con el cupo de producción
        // (10 cada 5 min) la suite empieza a fallar con 429 al crecer, por algo
        // que en producción es justamente lo que se quiere.
        builder.UseSetting("RateLimiting:AuthPermitLimit", "10000");
        builder.UseSetting("RateLimiting:GlobalPermitLimit", "100000");
    }
}

/// <summary>
/// UNA sola API para todos los tests de integración: dos hosts en paralelo
/// migran y seedean la misma DB a la vez → deadlock de Postgres en el boot.
/// </summary>
[CollectionDefinition("api")]
public sealed class ApiCollection : ICollectionFixture<ApiFactory>;
