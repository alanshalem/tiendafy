using System.Net;
using Api.Import;

namespace UnitTests.Api;

/// <summary>
/// La defensa anti-SSRF de lo que el servidor descarga de URLs ajenas (las
/// imágenes del CSV): nada de la red interna, de la propia máquina ni de la
/// metadata de la nube.
/// </summary>
public sealed class PublicUrlGuardTests
{
    [Theory]
    [InlineData("127.0.0.1")]
    [InlineData("10.1.2.3")]
    [InlineData("172.16.0.1")]
    [InlineData("172.31.255.255")]
    [InlineData("192.168.1.10")]
    [InlineData("169.254.169.254")] // metadata de la nube
    [InlineData("100.64.0.1")]      // CGNAT
    [InlineData("0.0.0.0")]
    [InlineData("224.0.0.1")]
    [InlineData("::1")]
    [InlineData("fe80::1")]
    [InlineData("fd00::1")]
    [InlineData("ff02::1")]
    public void Lo_interno_no_se_descarga(string ip) =>
        Assert.True(PublicUrlGuard.IsPrivateOrReserved(IPAddress.Parse(ip)));

    // Regresión: una IPv4 escrita como IPv6 y la dirección "::" pasaban como públicas,
    // así que un DNS armado a propósito llevaba la descarga a la red interna.
    [Theory]
    [InlineData("::ffff:127.0.0.1")]
    [InlineData("::ffff:169.254.169.254")]
    [InlineData("::ffff:10.0.0.5")]
    [InlineData("::")]
    public void Las_formas_disfrazadas_tampoco(string ip) =>
        Assert.True(PublicUrlGuard.IsPrivateOrReserved(IPAddress.Parse(ip)));

    [Theory]
    [InlineData("8.8.8.8")]
    [InlineData("172.32.0.1")]   // justo afuera de 172.16/12
    [InlineData("100.128.0.1")]  // justo afuera de CGNAT
    [InlineData("2001:4860:4860::8888")]
    [InlineData("::ffff:8.8.8.8")]
    public void Lo_publico_si(string ip) =>
        Assert.False(PublicUrlGuard.IsPrivateOrReserved(IPAddress.Parse(ip)));

    [Theory]
    [InlineData("ftp://ejemplo.com/a.jpg")]
    [InlineData("file:///etc/passwd")]
    [InlineData("no es una url")]
    [InlineData("http://localhost/a.jpg")]
    [InlineData("http://127.0.0.1/a.jpg")]
    [InlineData("http://[::ffff:127.0.0.1]/a.jpg")]
    [InlineData("https://host-que-no-existe.invalid/a.jpg")]
    public async Task Solo_se_baja_http_publico(string url) =>
        Assert.False(await PublicUrlGuard.IsFetchableAsync(url, CancellationToken.None));

    [Fact]
    public async Task Una_IP_publica_literal_se_puede_bajar() =>
        Assert.True(await PublicUrlGuard.IsFetchableAsync("https://8.8.8.8/logo.png", CancellationToken.None));

    // La IP se vuelve a validar al conectar (DNS rebinding) y un 302 no se sigue.
    [Theory]
    [InlineData("127.0.0.1")]
    [InlineData("localhost")]
    [InlineData("169.254.169.254")]
    public async Task Al_conectar_rechaza_lo_interno(string host)
    {
        var ex = await Assert.ThrowsAsync<HttpRequestException>(async () =>
            await PublicUrlGuard.ConnectToPublicAsync(new DnsEndPoint(host, 80), CancellationToken.None));
        Assert.Contains("no resuelve a una dirección pública", ex.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task El_cliente_de_descargas_no_sigue_redirecciones_y_valida_al_conectar()
    {
        using var handler = PublicUrlGuard.CreateHandler();
        Assert.False(handler.AllowAutoRedirect);

        using var http = new HttpClient(handler);
        var ex = await Assert.ThrowsAsync<HttpRequestException>(() => http.GetAsync("http://127.0.0.1:9/imagen.jpg"));
        Assert.Contains("no resuelve a una dirección pública", ex.ToString(), StringComparison.Ordinal);
    }
}
