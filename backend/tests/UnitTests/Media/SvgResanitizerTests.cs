using System.Net;
using System.Text;
using Amazon.Runtime;
using Amazon.S3;
using Media.Infrastructure;
using Microsoft.Extensions.Logging.Abstractions;

namespace UnitTests.Media;

/// <summary>
/// El paso único después del deploy (<c>dotnet Api.dll resanitize-svg</c>): los
/// SVG que ya estaban en el bucket público pasaron por el sanitizador viejo y
/// se servían en línea. Contra un bucket de mentira que contesta como S3
/// (listado paginado, GET con sus cabeceras, PUT que guarda).
/// </summary>
public sealed class SvgResanitizerTests
{
    private const string Bucket = "tiendafy-media";

    private const string Malicious =
        """<svg xmlns="http://www.w3.org/2000/svg" xmlns:s="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><s:script>alert(document.cookie)</s:script><rect width="10" height="10" onload="alert(1)"/></svg>""";

    private const string Logo = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#123456"/></svg>""";

    [Fact]
    public async Task Re_sanea_los_SVG_viejos_y_los_deja_con_attachment_sin_tocar_el_resto()
    {
        var tenant = Guid.NewGuid();
        var bucket = new FakeBucket();
        var clean = SvgSanitizer.Sanitize(Encoding.UTF8.GetBytes(Logo)).Value;
        bucket.Put($"{tenant}/malo.svg", Encoding.UTF8.GetBytes(Malicious), "image/svg+xml", disposition: null);
        bucket.Put($"{tenant}/ya-saneado.svg", clean, "image/svg+xml", "attachment");
        bucket.Put($"{tenant}/sin-attachment.svg", clean, "image/svg+xml", disposition: null);
        bucket.Put($"{tenant}/roto.svg", "esto no es un svg"u8.ToArray(), "image/svg+xml", disposition: null);
        bucket.Put($"{tenant}/foto.png", [0x89, 0x50, 0x4E, 0x47], "image/png", disposition: null);

        var report = await Resanitizer(bucket).RunAsync();

        Assert.Equal(new SvgResanitizeReport(Checked: 4, Rewritten: 3, Unsanitizable: 1), report);

        var malo = bucket.Objects[$"{tenant}/malo.svg"];
        var text = Encoding.UTF8.GetString(malo.Body);
        Assert.DoesNotContain("script", text, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("onload", text, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("<rect", text, StringComparison.Ordinal);
        Assert.Equal("attachment", malo.Disposition);
        Assert.Equal("image/svg+xml", malo.ContentType);

        Assert.Equal("attachment", bucket.Objects[$"{tenant}/sin-attachment.svg"].Disposition);
        Assert.Equal(clean, bucket.Objects[$"{tenant}/sin-attachment.svg"].Body);

        // Lo que no se puede sanear no se borra: queda igual, pero se descarga.
        Assert.Equal("esto no es un svg"u8.ToArray(), bucket.Objects[$"{tenant}/roto.svg"].Body);
        Assert.Equal("attachment", bucket.Objects[$"{tenant}/roto.svg"].Disposition);

        // Lo que ya estaba bien y lo que no es SVG no se tocan.
        Assert.DoesNotContain($"{tenant}/ya-saneado.svg", bucket.PutKeys);
        Assert.DoesNotContain($"{tenant}/foto.png", bucket.PutKeys);
        Assert.Null(bucket.Objects[$"{tenant}/foto.png"].Disposition);
    }

    [Fact]
    public async Task Es_idempotente_la_segunda_pasada_no_sube_nada()
    {
        var bucket = new FakeBucket();
        bucket.Put("t/malo.svg", Encoding.UTF8.GetBytes(Malicious), "image/svg+xml", disposition: null);
        bucket.Put("t/roto.svg", "nada"u8.ToArray(), "image/svg+xml", disposition: null);

        await Resanitizer(bucket).RunAsync();
        bucket.PutKeys.Clear();
        var second = await Resanitizer(bucket).RunAsync();

        Assert.Equal(0, second.Rewritten);
        Assert.Empty(bucket.PutKeys);
    }

    [Fact]
    public async Task Recorre_todas_las_paginas_del_listado()
    {
        var bucket = new FakeBucket { PageSize = 2 };
        for (var i = 0; i < 5; i++)
            bucket.Put($"t/{i}.svg", Encoding.UTF8.GetBytes(Malicious), "image/svg+xml", disposition: null);

        var report = await Resanitizer(bucket).RunAsync();

        Assert.Equal(5, report.Checked);
        Assert.Equal(5, report.Rewritten);
        Assert.True(bucket.ListCalls >= 3);
    }

    private static SvgResanitizer Resanitizer(FakeBucket bucket)
    {
        // https, como R2: el cuerpo va entero y sin firmar (ver S3MediaStorage).
        var s3 = new AmazonS3Client(new BasicAWSCredentials("k", "s"), new AmazonS3Config
        {
            ServiceURL = "https://cuenta.r2.cloudflarestorage.com",
            ForcePathStyle = true,
            AuthenticationRegion = "auto",
            HttpClientFactory = new Factory(bucket),
        });
        return new SvgResanitizer(s3, new MediaOptions
        {
            Endpoint = "https://cuenta.r2.cloudflarestorage.com",
            PublicBaseUrl = "https://img.tienda.com",
            AccessKey = "k",
            SecretKey = "s",
            Bucket = Bucket,
        }, NullLogger<SvgResanitizer>.Instance);
    }

    private sealed record StoredObject(byte[] Body, string ContentType, string? Disposition);

    /// <summary>Un bucket S3 en memoria, path-style: ListObjectsV2 paginado, GET y PUT de objetos.</summary>
    private sealed class FakeBucket : HttpMessageHandler
    {
        public SortedDictionary<string, StoredObject> Objects { get; } = new(StringComparer.Ordinal);
        public List<string> PutKeys { get; } = [];
        public int PageSize { get; init; } = 1000;
        public int ListCalls { get; private set; }

        public void Put(string key, byte[] body, string contentType, string? disposition) =>
            Objects[key] = new StoredObject(body, contentType, disposition);

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            var path = Uri.UnescapeDataString(request.RequestUri!.AbsolutePath).TrimStart('/');
            var query = System.Web.HttpUtility.ParseQueryString(request.RequestUri.Query);

            if (request.Method == HttpMethod.Get && path.TrimEnd('/') == Bucket && query["list-type"] == "2")
                return List(query["continuation-token"]);

            var key = path.StartsWith(Bucket + "/", StringComparison.Ordinal) ? path[(Bucket.Length + 1)..] : null;
            if (key is null) return new HttpResponseMessage(HttpStatusCode.BadRequest);

            if (request.Method == HttpMethod.Get)
            {
                if (!Objects.TryGetValue(key, out var obj)) return new HttpResponseMessage(HttpStatusCode.NotFound);
                var res = new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(obj.Body) };
                res.Content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(obj.ContentType);
                if (obj.Disposition is not null)
                    res.Content.Headers.TryAddWithoutValidation("Content-Disposition", obj.Disposition);
                res.Headers.ETag = Etag(obj.Body);
                return res;
            }

            if (request.Method == HttpMethod.Put)
            {
                var body = request.Content is null ? [] : await request.Content.ReadAsByteArrayAsync(ct);
                var type = request.Content?.Headers.ContentType?.ToString() ?? "binary/octet-stream";
                var disposition = request.Content?.Headers.ContentDisposition?.ToString()
                    ?? (request.Headers.TryGetValues("Content-Disposition", out var d) ? string.Join(",", d) : null);
                Objects[key] = new StoredObject(body, type, disposition);
                PutKeys.Add(key);
                var ok = new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("") };
                ok.Headers.ETag = Etag(body);
                return ok;
            }

            return new HttpResponseMessage(HttpStatusCode.MethodNotAllowed);
        }

        /// <summary>Como S3: el MD5 del contenido, en hex (el SDK lo compara con lo que bajó).</summary>
#pragma warning disable CA5351 // No es seguridad: es la forma del ETag de S3, que el SDK verifica.
        private static System.Net.Http.Headers.EntityTagHeaderValue Etag(byte[] body) =>
            new($"\"{Convert.ToHexStringLower(System.Security.Cryptography.MD5.HashData(body))}\"");
#pragma warning restore CA5351

        private HttpResponseMessage List(string? token)
        {
            ListCalls++;
            var start = token is null ? 0 : int.Parse(token, System.Globalization.CultureInfo.InvariantCulture);
            var keys = Objects.Keys.Skip(start).Take(PageSize).ToList();
            var next = start + keys.Count;
            var truncated = next < Objects.Count;
            var xml = new StringBuilder()
                .Append("""<?xml version="1.0" encoding="UTF-8"?><ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">""")
                .Append($"<Name>{Bucket}</Name><Prefix></Prefix><KeyCount>{keys.Count}</KeyCount><MaxKeys>1000</MaxKeys>")
                .Append($"<IsTruncated>{(truncated ? "true" : "false")}</IsTruncated>");
            foreach (var k in keys)
                xml.Append($"<Contents><Key>{k}</Key><LastModified>2026-10-01T00:00:00.000Z</LastModified><ETag>{Etag(Objects[k].Body).Tag}</ETag><Size>{Objects[k].Body.Length}</Size><StorageClass>STANDARD</StorageClass></Contents>");
            if (truncated) xml.Append($"<NextContinuationToken>{next}</NextContinuationToken>");
            xml.Append("</ListBucketResult>");
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(xml.ToString(), Encoding.UTF8, "application/xml"),
            };
        }
    }

    private sealed class Factory(HttpMessageHandler handler) : HttpClientFactory
    {
        public override HttpClient CreateHttpClient(IClientConfig clientConfig) => new(handler, disposeHandler: false);

        public override bool UseSDKHttpClientCaching(IClientConfig clientConfig) => false;
    }
}
