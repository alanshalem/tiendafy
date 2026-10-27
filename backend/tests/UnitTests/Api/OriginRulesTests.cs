using Api.Auth;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Hosting.Internal;

namespace UnitTests.Api;

/// <summary>
/// Los orígenes en producción: CORS con credenciales para el panel y las
/// tiendas; nunca para el host de las fotos, un subdominio reservado o lo de
/// staging cuando cuelga del dominio de producción. La sesión del panel, solo
/// desde el panel (o la propia API).
/// </summary>
public sealed class OriginRulesTests
{
    private static OriginRules Production(string? admin = "https://admin.tiendafy.com.ar", string media = "https://img.tiendafy.com.ar") =>
        new(new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Tenancy:PlatformBaseDomain"] = "tiendafy.com.ar",
            ["Admin:BaseUrl"] = admin,
            ["PublicApiBaseUrl"] = "https://api.tiendafy.com.ar",
            ["Media:PublicBaseUrl"] = media,
            ["Cors:AllowedOrigins:0"] = "https://www.mitienda.com",
        }).Build(), new HostingEnvironment { EnvironmentName = Environments.Production });

    [Theory]
    [InlineData("https://admin.tiendafy.com.ar", true)]   // el panel
    [InlineData("https://mates.tiendafy.com.ar", true)]   // una tienda
    [InlineData("https://tiendafy.com.ar", true)]         // la tienda del dominio pelado
    [InlineData("https://www.mitienda.com", true)]        // dominio propio de un comercio
    [InlineData("https://img.tiendafy.com.ar", false)]    // las fotos
    [InlineData("https://api.tiendafy.com.ar", false)]    // reservado
    [InlineData("https://staging.tiendafy.com.ar", false)]
    [InlineData("https://mates.stg.tiendafy.com.ar", false)] // staging colgado de producción
    [InlineData("https://admin.stg.tiendafy.com.ar", false)]
    [InlineData("https://tiendafy.com.ar.evil.com", false)]
    [InlineData("https://eviltiendafy.com.ar", false)]
    [InlineData("http://localhost:5173", false)]          // localhost solo en desarrollo
    [InlineData("null", false)]
    public void CORS(string origin, bool allowed) => Assert.Equal(allowed, Production().IsCorsAllowed(origin));

    [Fact]
    public void El_host_de_las_fotos_queda_afuera_aunque_sea_un_subdominio_con_nombre_de_tienda()
    {
        var rules = Production(media: "https://fotos.tiendafy.com.ar");
        Assert.False(rules.IsCorsAllowed("https://fotos.tiendafy.com.ar"));
        Assert.True(rules.IsCorsAllowed("https://mates.tiendafy.com.ar"));
    }

    [Theory]
    [InlineData(null, true)]                                   // sin Origin: navegación, descarga
    [InlineData("https://admin.tiendafy.com.ar", true)]       // el panel
    [InlineData("https://api.tiendafy.com.ar", true)]         // la propia API
    [InlineData("https://mates.tiendafy.com.ar", false)]      // una tienda
    [InlineData("https://img.tiendafy.com.ar", false)]        // las fotos
    [InlineData("https://admin.stg.tiendafy.com.ar", false)]  // el panel de staging
    [InlineData("https://sitio-malicioso.example", false)]
    public void La_sesion_del_panel(string? origin, bool allowed)
    {
        var http = new DefaultHttpContext();
        http.Request.Scheme = "https";
        http.Request.Host = new HostString("api.tiendafy.com.ar");
        if (origin is not null) http.Request.Headers.Origin = origin;
        Assert.Equal(allowed, Production().AllowsPanelSession(http.Request));
    }

    [Fact]
    public void Sin_Admin_BaseUrl_el_panel_es_admin_del_dominio()
    {
        var rules = Production(admin: null);
        Assert.True(rules.IsPanel("https://admin.tiendafy.com.ar"));
        Assert.False(rules.IsPanel("https://mates.tiendafy.com.ar"));
    }
}
