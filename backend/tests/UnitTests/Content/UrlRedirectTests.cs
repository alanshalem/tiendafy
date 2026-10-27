using Content.Infrastructure;

namespace UnitTests.Content;

/// <summary>
/// Las reglas de redirección se normalizan igual en cualquier sistema operativo.
/// Regresión: se decidía "es una URL" con Uri.TryCreate(Absolute), y en Linux
/// —donde corre producción— "/productos/remera" es absoluta (file:///…): toda
/// regla con una ruta de la tienda se rechazaba con 400. En Windows pasaba.
/// </summary>
public sealed class UrlRedirectTests
{
    [Theory]
    [InlineData("/productos/remera", "/productos/remera")]
    [InlineData("productos/remera", "/productos/remera")]
    [InlineData("//productos/remera", "/productos/remera")]
    [InlineData("https://nueva.com/a?b=1", "https://nueva.com/a?b=1")]
    [InlineData("HTTP://nueva.com/a", "http://nueva.com/a")]
    public void El_destino_acepta_rutas_de_la_tienda_y_urls_http(string raw, string expected) =>
        Assert.Equal(expected, UrlRedirect.NormalizeTo(raw));

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("javascript:alert(1)")]
    [InlineData("data:text/html,hola")]
    [InlineData("file:///etc/passwd")]
    [InlineData("ftp://servidor.com/archivo")]
    [InlineData(@"/\otro-sitio.com")]
    [InlineData(@"\otro-sitio.com")]
    [InlineData(@"\\otro-sitio.com/x")]
    [InlineData(@"/productos\..\x")]
    [InlineData(@"https://nueva.com\@otro.com/")]
    [InlineData("/\totro-sitio.com")]
    [InlineData("/\notro-sitio.com")]
    public void El_destino_rechaza_lo_que_no_es_una_ruta_ni_http(string raw) =>
        Assert.Null(UrlRedirect.NormalizeTo(raw));

    [Theory]
    [InlineData("/Zapatos/", "/zapatos")]
    [InlineData("zapatos?utm_source=ig", "/zapatos")]
    [InlineData("/zapatos#arriba", "/zapatos")]
    [InlineData("https://vieja.com/Productos/Remera-Azul?ref=1", "/productos/remera-azul")]
    [InlineData("//otro-sitio.com/x", "/otro-sitio.com/x")]
    public void El_origen_queda_en_una_sola_forma(string raw, string expected) =>
        Assert.Equal(expected, UrlRedirect.NormalizeFrom(raw));

    [Theory]
    [InlineData("")]
    [InlineData("/")]
    [InlineData("https://vieja.com/")]
    [InlineData("ftp://vieja.com/zapatos")]
    public void El_origen_no_puede_ser_la_portada_ni_otro_esquema(string raw) =>
        Assert.Null(UrlRedirect.NormalizeFrom(raw));

    [Fact]
    public void Una_regla_que_apunta_a_si_misma_se_rechaza()
    {
        var loop = UrlRedirect.Create(Guid.NewGuid(), "/a", "/a");
        Assert.True(loop.IsFailure);
        Assert.Equal("Redirect.Loop", loop.Error.Code);

        var ok = UrlRedirect.Create(Guid.NewGuid(), "/producto-viejo", "/productos/nuevo");
        Assert.True(ok.IsSuccess);
        Assert.Equal("/productos/nuevo", ok.Value.ToPath);
    }
}
