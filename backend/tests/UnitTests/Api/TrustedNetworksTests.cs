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

    /// <summary>
    /// Regresión: los cupos contaban cada IPv6 por separado, y un proveedor le da
    /// a cada cliente una /64 entera: cambiar de dirección era cupo nuevo.
    /// </summary>
    [Theory]
    [InlineData("2001:db8:1:2::1", "2001:db8:1:2:ffff:ffff:ffff:ffff", true)]
    [InlineData("2001:db8:1:2::1", "2001:db8:1:3::1", false)]   // otra /64, otro cliente
    [InlineData("200.45.10.1", "::ffff:200.45.10.1", true)]      // IPv4 escrita como IPv6
    [InlineData("200.45.10.1", "200.45.10.2", false)]            // IPv4: por dirección
    public void En_IPv6_se_cuenta_por_red_64(string a, string b, bool same)
    {
        var keyA = TrustedNetworks.ClientKey(IPAddress.Parse(a));
        var keyB = TrustedNetworks.ClientKey(IPAddress.Parse(b));
        Assert.Equal(same, keyA == keyB);
        Assert.Equal(same, PartitionFor(a) == PartitionFor(b)); // el techo global también
    }

    [Fact]
    public void La_clave_de_una_IPv6_es_su_prefijo() =>
        Assert.Equal("2001:db8:1:2::/64", TrustedNetworks.ClientKey(IPAddress.Parse("2001:db8:1:2:aaaa:bbbb:cccc:dddd")));
}
