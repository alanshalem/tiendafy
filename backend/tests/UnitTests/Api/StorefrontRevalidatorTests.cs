using System.Net;
using System.Text.Json;
using Api.Storefront;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace UnitTests.Api;

/// <summary>
/// El aviso al storefront para que vence su caché: qué manda, con qué secreto,
/// y que una falla nunca le llegue a quien publicó (queda en el log y la
/// caché vence sola por tiempo).
/// </summary>
public sealed class StorefrontRevalidatorTests
{
    private const string Url = "http://storefront:3000/internal/revalidate";
    private static readonly Guid Tenant = Guid.Parse("08f81530-fcdc-46b4-a764-d7fdd54d1881");

    private sealed class Recorder(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        public List<(HttpRequestMessage Request, string Body)> Sent { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Sent.Add((request, request.Content is null ? "" : await request.Content.ReadAsStringAsync(ct)));
            return respond(request);
        }
    }

    private sealed class Factory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }

    private static StorefrontRevalidator Create(Recorder handler, string url = Url, string secret = "s3creto") =>
        new(new Factory(handler),
            Options.Create(new StorefrontOptions { RevalidateUrl = url, RevalidateSecret = secret }),
            NullLogger<StorefrontRevalidator>.Instance);

    [Fact]
    public async Task Manda_la_tienda_y_las_familias_con_el_secreto()
    {
        var handler = new Recorder(_ => new HttpResponseMessage(HttpStatusCode.OK));
        await Create(handler).RevalidateAsync(Tenant, StorefrontScope.Categories, StorefrontScope.Catalog, StorefrontScope.Catalog);

        var (request, body) = Assert.Single(handler.Sent);
        Assert.Equal(HttpMethod.Post, request.Method);
        Assert.Equal(Url, request.RequestUri!.ToString());
        Assert.Equal("s3creto", request.Headers.GetValues("X-Revalidate-Secret").Single());
        var json = JsonDocument.Parse(body).RootElement;
        Assert.Equal(Tenant, json.GetProperty("tenantId").GetGuid());
        Assert.Equal(["categories", "catalog"], json.GetProperty("scopes").EnumerateArray().Select(s => s.GetString()));
    }

    [Theory]
    [InlineData("", "s3creto")]
    [InlineData(Url, "")]
    public async Task Sin_configurar_no_manda_nada(string url, string secret)
    {
        var handler = new Recorder(_ => new HttpResponseMessage(HttpStatusCode.OK));
        await Create(handler, url, secret).RevalidateAsync(Tenant, StorefrontScope.Theme);
        Assert.Empty(handler.Sent);
    }

    [Fact]
    public async Task Un_storefront_caido_o_que_rechaza_no_tira()
    {
        var down = new Recorder(_ => throw new HttpRequestException("connection refused"));
        await Create(down).RevalidateAsync(Tenant, StorefrontScope.Theme);

        var rejects = new Recorder(_ => new HttpResponseMessage(HttpStatusCode.Unauthorized));
        await Create(rejects).RevalidateAsync(Tenant, StorefrontScope.Theme);

        var slow = new Recorder(_ => throw new TaskCanceledException("timeout"));
        await Create(slow).RevalidateAsync(Tenant, StorefrontScope.Theme);

        // Una URL mal escrita en la config tampoco rompe la publicación.
        await Create(new Recorder(_ => new HttpResponseMessage(HttpStatusCode.OK)), "no es una url").RevalidateAsync(Tenant, StorefrontScope.Theme);
    }
}
