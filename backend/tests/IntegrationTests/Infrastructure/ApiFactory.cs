using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Http;

namespace IntegrationTests;

/// <summary>
/// La API real, contra Postgres, para todos los tests de integración. Usa una
/// base propia (tiendafy_itests, o TIENDAFY_TEST_DB) que migra al arrancar.
/// </summary>
public sealed class ApiFactory : WebApplicationFactory<Program>
{
    /// <summary>Adonde va todo el HTTP saliente de la API (ver <see cref="FakeHttp"/>).</summary>
    public FakeHttp ExternalHttp { get; } = new();

    /// <summary>Con este secreto los tests firman los webhooks de Mercado Pago.</summary>
    public const string MercadoPagoWebhookSecret = "test-webhook-secret";

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
        // Mercado Pago "configurado" con credenciales de mentira: las llamadas
        // van al fake, y el secreto permite firmar webhooks como lo hace MP.
        builder.UseSetting("MercadoPago:ClientId", "test-client-id");
        builder.UseSetting("MercadoPago:ClientSecret", "test-client-secret");
        builder.UseSetting("MercadoPago:RedirectUri", "http://localhost:5080/api/v1/payments/mercadopago/callback");
        builder.UseSetting("MercadoPago:WebhookSecret", MercadoPagoWebhookSecret);
        // Mercado Libre igual: con app "configurada" se puede conectar una
        // cuenta real (contra el fake) además de la de demostración.
        builder.UseSetting("MercadoLibre:ClientId", "test-meli-client");
        builder.UseSetting("MercadoLibre:ClientSecret", "test-meli-secret");
        builder.UseSetting("MercadoLibre:RedirectUri", "http://localhost:5080/api/v1/meli/oauth/callback");

        // Ningún test sale a internet: todos los HttpClient de la API (los
        // tipados de cada integración incluidos) terminan en el fake. La
        // acción se agrega al final, así que pisa el handler propio que
        // configure cada cliente (el de ARCA, por ejemplo).
        builder.ConfigureTestServices(services =>
            services.ConfigureAll<HttpClientFactoryOptions>(o =>
                o.HttpMessageHandlerBuilderActions.Add(b => b.PrimaryHandler = ExternalHttp.CreateHandler())));
    }
}

/// <summary>
/// UNA sola API para todos los tests de integración: dos hosts en paralelo
/// migran y seedean la misma DB a la vez → deadlock de Postgres en el boot.
/// </summary>
[CollectionDefinition("api")]
public sealed class ApiCollection : ICollectionFixture<ApiFactory>;
