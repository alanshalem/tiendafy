using System.Net;
using Api.Startup;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;

namespace UnitTests.Api;

/// <summary>
/// Las redes de nuestros propios servidores y el techo global de pedidos.
///
/// Regresión: en producción no había redes configuradas, así que detrás de
/// Caddy todo el tráfico parecía venir de Caddy y los límites por IP se
/// compartían entre todos los usuarios; y el storefront, que arma cada página
/// llamando a la API por la red interna, consumía un único cupo por todos los
/// compradores de todas las tiendas.
/// </summary>
public sealed class TrustedNetworksTests
{
    private static IReadOnlyList<IPNetwork> Docker() => TrustedNetworks.From(new ConfigurationBuilder()
        .AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ForwardedHeaders:KnownNetworks:0"] = "172.16.0.0/12",
            ["ForwardedHeaders:KnownNetworks:1"] = "no-es-un-cidr",
            ["ForwardedHeaders:KnownNetworks:2"] = "10.0.0.0/8",
        })
        .Build());

    [Fact]
    public void Lee_las_redes_e_ignora_lo_mal_escrito()
    {
        Assert.Equal(2, Docker().Count);
        Assert.Empty(TrustedNetworks.From(null));
    }

    [Theory]
    [InlineData("172.18.0.5", true)]
    [InlineData("::ffff:172.18.0.5", true)] // la misma, escrita como IPv6
    [InlineData("10.1.2.3", true)]
    [InlineData("200.45.10.1", false)]
    [InlineData("192.168.1.1", false)]      // no configurada
    public void Reconoce_las_direcciones_de_nuestras_redes(string ip, bool expected) =>
        Assert.Equal(expected, TrustedNetworks.Contains(Docker(), IPAddress.Parse(ip)));

    [Fact]
    public void Sin_direccion_no_es_nuestra() =>
        Assert.False(TrustedNetworks.Contains(Docker(), null));

    private static string PartitionFor(string? ip)
    {
        var context = new DefaultHttpContext();
        context.Connection.RemoteIpAddress = ip is null ? null : IPAddress.Parse(ip);
        return TrustedNetworks.GlobalPartition(context, Docker(), permitLimit: 300).PartitionKey;
    }

    [Fact]
    public void El_techo_global_es_por_cliente_y_nuestros_servidores_no_lo_consumen()
    {
        Assert.Equal("internal", PartitionFor("172.18.0.7"));   // el storefront armando una página
        Assert.Equal("200.45.10.1", PartitionFor("200.45.10.1")); // un comprador (IP real vía Caddy)
        Assert.NotEqual(PartitionFor("200.45.10.1"), PartitionFor("181.1.2.3"));
        Assert.Equal("unknown", PartitionFor(null));
    }
}
