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

    /// <summary>Anota las cabeceras de cada PUT de objeto, y lo da por bueno.</summary>
    private sealed class HeaderRecorder : HttpMessageHandler
    {
        public List<Dictionary<string, string>> Puts { get; } = [];

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            if (request.Method == HttpMethod.Put)
            {
                var headers = request.Headers.Concat(request.Content?.Headers ?? Enumerable.Empty<KeyValuePair<string, IEnumerable<string>>>())
                    .ToDictionary(h => h.Key.ToLowerInvariant(), h => string.Join(",", h.Value));
                Puts.Add(headers);
            }
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("") });
        }
    }

    private static readonly byte[] Png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0];

    /// <summary>
    /// R2 rechaza la subida "en trozos firmados" (Streaming SigV4, con el
    /// checksum al final) que AWSSDK.S3 usa por defecto sobre https: la
    /// primera foto subida en producción falló así, y en desarrollo MinIO la
    /// acepta. Las dos subidas (la pública y los adjuntos privados) tienen que
    /// mandar el cuerpo entero, sin firmar el contenido y sin checksum al final.
    /// </summary>
    [Fact]
    public async Task Las_subidas_van_en_el_formato_que_acepta_R2()
    {
        var recorder = new HeaderRecorder();
        var s3 = new AmazonS3Client(new BasicAWSCredentials("k", "s"), new AmazonS3Config
        {
            ServiceURL = "https://cuenta.r2.cloudflarestorage.com",
            ForcePathStyle = true,
            AuthenticationRegion = "auto",
            HttpClientFactory = new StubFactory(recorder),
        });
        var storage = new S3MediaStorage(s3, new MediaOptions
        {
            Endpoint = "https://cuenta.r2.cloudflarestorage.com",
            PublicBaseUrl = "https://img.tienda.com",
            AccessKey = "k",
            SecretKey = "s",
            BucketInPublicUrl = false,
        });

        var publica = await storage.UploadAsync(Guid.NewGuid(), new MemoryStream(Png), "image/png", Png.Length);
        var privada = await storage.UploadPrivateAsync(Guid.NewGuid(), "chat", new MemoryStream(Png), "image/png", Png.Length);

        Assert.True(publica.IsSuccess);
        Assert.True(privada.IsSuccess);
        Assert.Equal(2, recorder.Puts.Count);
        foreach (var put in recorder.Puts)
        {
            Assert.Equal("UNSIGNED-PAYLOAD", put["x-amz-content-sha256"]);
            Assert.False(put.ContainsKey("x-amz-trailer"), "no manda checksum al final");
            Assert.False(put.TryGetValue("content-encoding", out var enc) && enc.Contains("aws-chunked", StringComparison.Ordinal),
                "no manda el cuerpo en trozos");
        }
    }

    /// <summary>Un stream que solo avanza (como el cuerpo de una respuesta o una tubería).</summary>
    private sealed class ForwardOnly(byte[] data) : Stream
    {
        private readonly MemoryStream _inner = new(data);
        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException();
        public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
        public override void Flush() { }
        public override int Read(byte[] buffer, int offset, int count) => _inner.Read(buffer, offset, count);
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }

    private static (S3MediaStorage Storage, HeaderRecorder Recorder) HttpsStorage()
    {
        var recorder = new HeaderRecorder();
        var s3 = new AmazonS3Client(new BasicAWSCredentials("k", "s"), new AmazonS3Config
        {
            ServiceURL = "https://cuenta.r2.cloudflarestorage.com",
            ForcePathStyle = true,
            AuthenticationRegion = "auto",
            HttpClientFactory = new StubFactory(recorder),
        });
        return (new S3MediaStorage(s3, new MediaOptions
        {
            Endpoint = "https://cuenta.r2.cloudflarestorage.com",
            PublicBaseUrl = "https://img.tienda.com",
            AccessKey = "k",
            SecretKey = "s",
        }), recorder);
    }

    /// <summary>
    /// La verificación de magic bytes se salteaba si el stream no se podía
    /// rebobinar (fallaba abierto): un HTML disfrazado de PNG subía. Ahora el
    /// stream se pasa a memoria y se verifica igual.
    /// </summary>
    [Fact]
    public async Task Un_stream_que_no_se_rebobina_tambien_se_verifica()
    {
        var (storage, recorder) = HttpsStorage();
        var html = "<html><script>alert(1)</script></html>"u8.ToArray();

        var fake = await storage.UploadAsync(Guid.NewGuid(), new ForwardOnly(html), "image/png", html.Length);
        var fakePrivate = await storage.UploadPrivateAsync(Guid.NewGuid(), "chat", new ForwardOnly(html), "image/png", html.Length);
        var real = await storage.UploadAsync(Guid.NewGuid(), new ForwardOnly(Png), "image/png", Png.Length);
        var realPrivate = await storage.UploadPrivateAsync(Guid.NewGuid(), "chat", new ForwardOnly(Png), "image/png", Png.Length);

        Assert.True(fake.IsFailure);
        Assert.Equal("Media.TypeMismatch", fake.Error.Code);
        Assert.True(fakePrivate.IsFailure);
        Assert.Equal("Media.TypeMismatch", fakePrivate.Error.Code);
        Assert.True(real.IsSuccess);
        Assert.True(realPrivate.IsSuccess);
        Assert.Equal(2, recorder.Puts.Count);
    }

    [Fact]
    public async Task Un_stream_que_no_se_rebobina_no_puede_pasar_el_largo_declarado()
    {
        var (storage, recorder) = HttpsStorage();
        // Declara 3 bytes pero trae más que el máximo de una imagen.
        var big = new byte[(int)S3MediaStorage.MaxImageBytes + 10];
        Png.CopyTo(big, 0);

        var result = await storage.UploadAsync(Guid.NewGuid(), new ForwardOnly(big), "image/png", 3);

        Assert.True(result.IsFailure);
        Assert.Equal("Media.TooLarge", result.Error.Code);
        Assert.Empty(recorder.Puts);
    }

    /// <summary>
    /// Por http (el MinIO de desarrollo) el SDK no deja subir sin firmar el
    /// contenido: tira "the request must be sent over HTTPS". Ahí sigue firmando.
    /// </summary>
    [Fact]
    public async Task Por_http_el_MinIO_de_desarrollo_sigue_recibiendo_las_subidas()
    {
        var recorder = new HeaderRecorder();
        var s3 = new AmazonS3Client(new BasicAWSCredentials("k", "s"), new AmazonS3Config
        {
            ServiceURL = "http://localhost:9000",
            ForcePathStyle = true,
            HttpClientFactory = new StubFactory(recorder),
        });
        var storage = new S3MediaStorage(s3, new MediaOptions
        {
            Endpoint = "http://localhost:9000",
            PublicBaseUrl = "http://localhost:9000",
            AccessKey = "k",
            SecretKey = "s",
        });

        var publica = await storage.UploadAsync(Guid.NewGuid(), new MemoryStream(Png), "image/png", Png.Length);
        var privada = await storage.UploadPrivateAsync(Guid.NewGuid(), "chat", new MemoryStream(Png), "image/png", Png.Length);

        Assert.True(publica.IsSuccess);
        Assert.True(privada.IsSuccess);
        Assert.Equal(2, recorder.Puts.Count);
    }
}
