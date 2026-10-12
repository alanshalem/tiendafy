using System.Net;
using System.Text;
using Amazon.Runtime;
using Amazon.S3;
using Media.Infrastructure;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace UnitTests.Media;

/// <summary>
/// La configuración del storage de imágenes: en producción no arranca contra
/// el MinIO de desarrollo (las subidas "andarían" y las imágenes apuntarían a
/// localhost), el cliente S3 firma con la región que pide R2, y al arrancar se
/// crean los buckets que falten (el público con lectura abierta, el privado sin).
/// </summary>
public sealed class MediaModuleTests
{
    private static ServiceProvider Build(Dictionary<string, string?> settings, bool isProduction = false)
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(settings).Build();
        return new ServiceCollection().AddMediaModule(config, isProduction).BuildServiceProvider();
    }

    private static readonly Dictionary<string, string?> Production = new()
    {
        ["Media:Endpoint"] = "https://cuenta.r2.cloudflarestorage.com",
        ["Media:PublicBaseUrl"] = "https://img.tienda.com",
        ["Media:AccessKey"] = "clave",
        ["Media:SecretKey"] = "secreto",
        ["Media:Region"] = "auto",
        ["Media:BucketInPublicUrl"] = "false",
    };

    [Fact]
    public void En_produccion_no_arranca_con_la_configuracion_de_desarrollo()
    {
        var ex = Assert.Throws<InvalidOperationException>(() => Build([], isProduction: true));
        Assert.Contains("Media:Endpoint apunta a localhost", ex.Message, StringComparison.Ordinal);
        Assert.Contains("Media:PublicBaseUrl apunta a localhost", ex.Message, StringComparison.Ordinal);
        Assert.Contains("son las de desarrollo", ex.Message, StringComparison.Ordinal);

        // 127.0.0.1 también es "esta máquina".
        var loopback = new Dictionary<string, string?>(Production)
        {
            ["Media:Endpoint"] = "http://127.0.0.1:9000",
            ["Media:PublicBaseUrl"] = "http://127.0.0.1:9000",
        };
        var again = Assert.Throws<InvalidOperationException>(() => Build(loopback, isProduction: true));
        Assert.Contains("Media:Endpoint", again.Message, StringComparison.Ordinal);
        Assert.DoesNotContain("de desarrollo", again.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Con_storage_real_arranca_y_firma_con_la_region_de_R2()
    {
        using var sp = Build(Production, isProduction: true);
        var options = sp.GetRequiredService<MediaOptions>();
        Assert.False(options.BucketInPublicUrl);
        Assert.Equal("https://img.tienda.com/a.jpg", options.PublicUrl("a.jpg"));

        var s3 = (AmazonS3Client)sp.GetRequiredService<IAmazonS3>();
        Assert.Equal("auto", s3.Config.AuthenticationRegion);
        Assert.True(((AmazonS3Config)s3.Config).ForcePathStyle);
        Assert.IsType<S3MediaStorage>(sp.GetRequiredService<IMediaStorage>());
    }

    [Fact]
    public void En_desarrollo_usa_MinIO_local_sin_region()
    {
        using var sp = Build([]);
        var options = sp.GetRequiredService<MediaOptions>();
        Assert.Equal("http://localhost:9000", options.Endpoint);
        Assert.True(options.BucketInPublicUrl);
        Assert.Null(((AmazonS3Client)sp.GetRequiredService<IAmazonS3>()).Config.AuthenticationRegion);
    }

    /// <summary>Un S3 de mentira: responde según si los buckets "existen".</summary>
    private sealed class StubS3(bool bucketsExist) : HttpMessageHandler
    {
        public List<string> Sent { get; } = [];

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            var target = $"{request.Method} {request.RequestUri!.AbsolutePath}{request.RequestUri.Query}";
            Sent.Add(target);
            if (request.Method == HttpMethod.Get && request.RequestUri.Query.Contains("acl", StringComparison.Ordinal))
            {
                return Task.FromResult(bucketsExist
                    ? Xml(HttpStatusCode.OK,
                        "<AccessControlPolicy><Owner><ID>o</ID></Owner><AccessControlList></AccessControlList></AccessControlPolicy>")
                    : Xml(HttpStatusCode.NotFound,
                        "<Error><Code>NoSuchBucket</Code><Message>No existe</Message></Error>"));
            }
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("") });
        }

        private static HttpResponseMessage Xml(HttpStatusCode status, string body) =>
            new(status) { Content = new StringContent(body, Encoding.UTF8, "application/xml") };
    }

    private sealed class StubFactory(HttpMessageHandler handler) : HttpClientFactory
    {
        public override HttpClient CreateHttpClient(IClientConfig clientConfig) => new(handler, disposeHandler: false);

        public override bool UseSDKHttpClientCaching(IClientConfig clientConfig) => false;
    }

    private static ServiceProvider WithStub(StubS3 stub)
    {
        var services = new ServiceCollection().AddMediaModule(new ConfigurationBuilder().Build());
        services.AddSingleton<IAmazonS3>(_ => new AmazonS3Client(new BasicAWSCredentials("k", "s"),
            new AmazonS3Config { ServiceURL = "http://s3.test", ForcePathStyle = true, HttpClientFactory = new StubFactory(stub) }));
        return services.BuildServiceProvider();
    }

    [Fact]
    public async Task Al_arrancar_crea_los_buckets_que_faltan_y_solo_el_publico_tiene_lectura_abierta()
    {
        var stub = new StubS3(bucketsExist: false);
        await using var sp = WithStub(stub);
        await sp.EnsureMediaBucketAsync();

        Assert.Contains(stub.Sent, s => s.StartsWith("PUT /tiendafy-media", StringComparison.Ordinal) && !s.Contains("policy", StringComparison.Ordinal));
        Assert.Contains(stub.Sent, s => s.StartsWith("PUT /tiendafy-media", StringComparison.Ordinal) && s.Contains("policy", StringComparison.Ordinal));
        Assert.Contains(stub.Sent, s => s.StartsWith("PUT /tiendafy-private", StringComparison.Ordinal));
        Assert.DoesNotContain(stub.Sent, s => s.StartsWith("PUT /tiendafy-private", StringComparison.Ordinal) && s.Contains("policy", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Si_los_buckets_ya_existen_no_toca_nada()
    {
        var stub = new StubS3(bucketsExist: true);
        await using var sp = WithStub(stub);
        await sp.EnsureMediaBucketAsync();
        Assert.DoesNotContain(stub.Sent, s => s.StartsWith("PUT", StringComparison.Ordinal));
    }
}
