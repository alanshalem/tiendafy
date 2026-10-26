using System.Net;
using MercadoLibre.Infrastructure;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace UnitTests.Meli;

public class MeliClientHeadersTests
{
    private sealed class Capture : HttpMessageHandler
    {
        public HttpRequestMessage? Last { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Last = request;
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("{}") });
        }
    }

    private static (MeliClient Client, Capture Handler) NewClient()
    {
        var handler = new Capture();
        var options = Options.Create(new MeliOptions { ApiBaseUrl = "https://api.example.test" });
        return (new MeliClient(new HttpClient(handler), options, NullLogger<MeliClient>.Instance), handler);
    }

    [Fact]
    public async Task Una_cabecera_extra_viaja_y_la_autorizacion_sigue_siendo_la_del_cliente()
    {
        var (client, handler) = NewClient();

        using var _ = await client.GetAsync("tok-real", "/x", CancellationToken.None,
            new Dictionary<string, string> { ["x-format-new"] = "true" });

        Assert.Equal("true", Assert.Single(handler.Last!.Headers.GetValues("x-format-new")));
        Assert.Equal("Bearer", handler.Last.Headers.Authorization!.Scheme);
        Assert.Equal("tok-real", handler.Last.Headers.Authorization.Parameter);
    }

    [Theory]
    [InlineData("Authorization")]
    [InlineData("authorization")]
    [InlineData("Accept")]
    public async Task Las_cabeceras_extra_no_pueden_pisar_authorization_ni_accept(string name)
    {
        var (client, handler) = NewClient();

        await Assert.ThrowsAsync<ArgumentException>(() => client.GetAsync("tok-real", "/x", CancellationToken.None,
            new Dictionary<string, string> { [name] = "Bearer otro" }));

        Assert.Null(handler.Last);
    }
}
