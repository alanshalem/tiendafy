using Api.Notifications;
using Microsoft.Extensions.Configuration;
using Tenancy.Core.Application;

namespace UnitTests.Notifications;

/// <summary>
/// Los links de las tiendas en mails y avisos: lo mismo que armaba cada worker
/// a mano, ahora en un solo lugar.
/// </summary>
public class StoreLinksTests
{
    private static StoreLinks Links(string platform = "Tiendafy.Test", string? apiBase = null) =>
        new(null!, new TenancyOptions { PlatformBaseDomain = platform },
            new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["PublicApiBaseUrl"] = apiBase }).Build());

    [Fact]
    public void Subdominio_con_el_esquema_pedido_y_dominio_propio_siempre_en_https()
    {
        var links = Links();

        Assert.Equal("tiendafy.test", links.PlatformDomain);
        Assert.Equal("https://mitienda.tiendafy.test", links.For(null, "mitienda", "https"));
        Assert.Equal("http://mitienda.tiendafy.test", links.For(" ", "mitienda", "http"));
        Assert.Equal("https://www.mitienda.com.ar", links.For("www.mitienda.com.ar", "mitienda", "http"));
    }

    [Fact]
    public void Las_campanias_van_en_https_salvo_en_localhost()
    {
        // Antes las cards de las campañas salían en http también en producción.
        var prod = Links("tiendafy.com.ar");
        Assert.Equal("https", prod.SubdomainScheme);
        Assert.Equal("https://mitienda.tiendafy.com.ar", prod.For(null, "mitienda", prod.SubdomainScheme));

        Assert.Equal("http", Links("localhost").SubdomainScheme);
        Assert.Equal("http", Links("tiendas.localhost").SubdomainScheme);
        Assert.Equal("http", Links("localhost:3000").SubdomainScheme);
        Assert.Equal("https", Links("mylocalhost.com").SubdomainScheme);
    }

    [Fact]
    public void La_API_publica_sin_configurar_es_la_de_desarrollo()
    {
        Assert.Equal("http://localhost:5080", Links().ApiBase);
        Assert.Equal("https://api.tiendafy.test", Links(apiBase: "https://api.tiendafy.test").ApiBase);
    }

    [Fact]
    public void El_dominio_de_la_config_sale_en_minusculas_y_sin_clave_es_localhost()
    {
        var cfg = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Tenancy:PlatformBaseDomain"] = "Tiendafy.COM" })
            .Build();

        Assert.Equal("tiendafy.com", StoreLinks.PlatformDomainOf(cfg));
        Assert.Equal("localhost", StoreLinks.PlatformDomainOf(new ConfigurationBuilder().Build()));
    }
}
