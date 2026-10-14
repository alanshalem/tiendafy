using Api.Startup;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.Extensions.DependencyInjection;

namespace UnitTests.Api;

/// <summary>
/// Qué respuestas de la API salen comprimidas: el JSON y el texto, salvo lo
/// chico (no ahorra nada) y lo que devuelve credenciales (BREACH).
/// </summary>
public class ResponseCompressionTests
{
    private static readonly IResponseCompressionProvider Provider = new ServiceCollection()
        .AddLogging()
        .AddAppResponseCompression()
        .BuildServiceProvider()
        .GetRequiredService<IResponseCompressionProvider>();

    private static DefaultHttpContext Response(string path, string contentType, long? length = null)
    {
        var http = new DefaultHttpContext();
        http.Request.Path = path;
        http.Request.Scheme = "https"; // como queda detrás de Caddy, con X-Forwarded-Proto
        http.Request.Headers.AcceptEncoding = "br, gzip";
        http.Response.ContentType = contentType;
        http.Response.ContentLength = length;
        return http;
    }

    [Fact]
    public void Se_registra_el_proveedor_propio() =>
        Assert.IsType<AppResponseCompressionProvider>(Provider);

    [Theory]
    [InlineData("application/json; charset=utf-8")]
    [InlineData("application/problem+json")]
    [InlineData("text/plain")]
    public void El_json_y_el_texto_se_comprimen_aunque_el_pedido_llegue_por_https(string type) =>
        Assert.True(Provider.ShouldCompressResponse(Response("/api/v1/products", type)));

    [Theory]
    [InlineData("application/pdf")]
    [InlineData("image/png")]
    [InlineData("text/event-stream")]
    public void Los_archivos_y_los_streams_no(string type) =>
        Assert.False(Provider.ShouldCompressResponse(Response("/api/v1/orders/x/label", type)));

    [Fact]
    public void Una_respuesta_chica_no_se_comprime() =>
        Assert.False(Provider.ShouldCompressResponse(
            Response("/api/v1/products", "application/json", AppResponseCompressionProvider.MinimumBytes - 1)));

    [Fact]
    public void Una_grande_con_largo_conocido_si() =>
        Assert.True(Provider.ShouldCompressResponse(
            Response("/api/v1/products", "application/json", AppResponseCompressionProvider.MinimumBytes)));

    [Theory]
    [InlineData("/api/v1/auth/me")]
    [InlineData("/api/v1/shop/auth/login")]
    [InlineData("/api/v1/theme/preview-token")]
    public void Lo_que_devuelve_credenciales_no_se_comprime(string path) =>
        Assert.False(Provider.ShouldCompressResponse(Response(path, "application/json")));

    [Fact]
    public void Una_ruta_que_solo_empieza_parecido_si_se_comprime() =>
        Assert.True(Provider.ShouldCompressResponse(Response("/api/v1/authors", "application/json")));

    [Fact]
    public void Lo_que_ya_viene_comprimido_no_se_vuelve_a_comprimir()
    {
        var http = Response("/api/v1/media/x", "application/json");
        http.Response.Headers.ContentEncoding = "gzip";
        Assert.False(Provider.ShouldCompressResponse(http));
    }
}
