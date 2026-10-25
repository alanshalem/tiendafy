using Amazon.Runtime;
using Amazon.S3;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
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

    /// <summary>Los modelos de IA: en vez de un proveedor real contestan lo que el test guionizó (ver <see cref="FakeAi"/>).</summary>
    public FakeAi Ai { get; } = new();

    /// <summary>Con este secreto los tests firman los webhooks de Mercado Pago.</summary>
    public const string MercadoPagoWebhookSecret = "test-webhook-secret";

    /// <summary>Y con este, los de Resend (formato svix: whsec_ + base64).</summary>
    public static readonly string ResendWebhookSecret =
        "whsec_" + Convert.ToBase64String("tiendafy-resend-webhook-secret!!"u8.ToArray());

    public const string ResendEmails = "https://api.resend.com/emails";

    /// <summary>Adónde avisa la API para que el storefront vence su caché (ver StorefrontRevalidationTests).</summary>
    public const string StorefrontRevalidate = "http://storefront.test/internal/revalidate";
    public const string StorefrontRevalidateSecret = "test-revalidate-secret";

    public ApiFactory()
    {
        // Los emails salen por Resend de verdad (el camino de producción, con
        // su payload y sus reintentos) y Resend "acepta" todo. Un test que
        // quiera probar un rechazo pisa esta respuesta y la restaura.
        AcceptAllEmails();
        AcceptAllUploads();
        ExternalHttp.OnJson(HttpMethod.Post, StorefrontRevalidate, new { revalidated = Array.Empty<string>() });
    }

    public void AcceptAllEmails() => ExternalHttp.OnJson(HttpMethod.Post, ResendEmails, new { id = "re_test" });

    /// <summary>El "MinIO" de los tests: el endpoint por defecto de Media, servido por el fake.</summary>
    public const string Storage = "http://localhost:9000";

    /// <summary>S3 acepta todo lo que se sube y se borra.</summary>
    public void AcceptAllUploads()
    {
        ExternalHttp.On(HttpMethod.Put, $"{Storage}/", (_, _) =>
        {
            var res = new HttpResponseMessage(System.Net.HttpStatusCode.OK);
            res.Headers.ETag = new System.Net.Http.Headers.EntityTagHeaderValue("\"etag\"");
            return res;
        });
        ExternalHttp.On(HttpMethod.Delete, $"{Storage}/", (_, _) => new HttpResponseMessage(System.Net.HttpStatusCode.NoContent));
    }

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
        builder.UseSetting("RateLimiting:CheckoutContactPermitLimit", "10000");
        builder.UseSetting("RateLimiting:AiPermitLimit", "10000");
        builder.UseSetting("RateLimiting:AiJobsPermitLimit", "10000");
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
        // Apps de redes "configuradas" (Meta y X): se puede recorrer su OAuth.
        builder.UseSetting("Social:Meta:AppId", "test-meta-app");
        builder.UseSetting("Social:Meta:AppSecret", "test-meta-secret");
        builder.UseSetting("Social:Meta:RedirectUri", "http://localhost:5080/api/v1/social/oauth/callback/meta");
        builder.UseSetting("Social:X:ClientId", "test-x-client");
        builder.UseSetting("Social:X:ClientSecret", "test-x-secret");
        builder.UseSetting("Social:X:RedirectUri", "http://localhost:5080/api/v1/social/oauth/callback/x");
        builder.UseSetting("MetaAds:AppId", "test-meta-ads-app");
        builder.UseSetting("MetaAds:AppSecret", "test-meta-ads-secret");
        builder.UseSetting("MetaAds:RedirectUri", "http://localhost:5080/api/v1/meta-ads/oauth/callback");
        // IA (Claude API) con una clave de mentira: las sugerencias y la lectura
        // de facturas van al fake.
        builder.UseSetting("Ai:ApiKey", "sk-ant-test");
        builder.UseSetting("Email:ResendApiKey", "re_test_key");
        builder.UseSetting("Email:WebhookSecret", ResendWebhookSecret);
        builder.UseSetting("Storefront:RevalidateUrl", StorefrontRevalidate);
        builder.UseSetting("Storefront:RevalidateSecret", StorefrontRevalidateSecret);

        // Ningún test sale a internet: todos los HttpClient de la API (los
        // tipados de cada integración incluidos) terminan en el fake. La
        // acción se agrega al final, así que pisa el handler propio que
        // configure cada cliente (el de ARCA, por ejemplo).
        builder.ConfigureTestServices(services =>
        {
            services.ConfigureAll<HttpClientFactoryOptions>(o =>
                o.HttpMessageHandlerBuilderActions.Add(b => b.PrimaryHandler = ExternalHttp.CreateHandler()));

            // Ninguna llamada a un modelo sale a un proveedor: el gateway, el medidor y el
            // consumo son los reales y lo único falso es el cliente de chat.
            services.RemoveAll<Api.Ai.IAiChatClientFactory>();
            services.AddSingleton<Api.Ai.IAiChatClientFactory>(Ai);

            // El cliente S3 del SDK de AWS no usa IHttpClientFactory: se le da
            // uno propio que también termina en el fake. El resto (firmas,
            // armado del pedido, S3MediaStorage entero) es el de producción.
            services.RemoveAll<IAmazonS3>();
            services.AddSingleton<IAmazonS3>(_ => new AmazonS3Client(
                new BasicAWSCredentials("test", "test"),
                new AmazonS3Config { ServiceURL = Storage, ForcePathStyle = true, HttpClientFactory = new S3ToFake(ExternalHttp) }));
        });
    }
}

/// <summary>
/// UNA sola API para todos los tests de integración: dos hosts en paralelo
/// migran y seedean la misma DB a la vez → deadlock de Postgres en el boot.
/// </summary>
[CollectionDefinition("api")]
public sealed class ApiCollection : ICollectionFixture<ApiFactory>;

/// <summary>El SDK de AWS pide sus HttpClient acá; todos van al fake.</summary>
internal sealed class S3ToFake(FakeHttp fake) : HttpClientFactory
{
    public override HttpClient CreateHttpClient(IClientConfig clientConfig) => new(fake.CreateHandler());

    public override bool UseSDKHttpClientCaching(IClientConfig clientConfig) => false;
}
