using System.Net;

namespace IntegrationTests;

/// <summary>
/// La sesión del panel solo vale desde el origen del panel (ver OriginRules). Un
/// script que corra en una tienda —un contenedor de GTM comprometido, por
/// ejemplo— manda la cookie del admin que la visita (es del mismo sitio), pero
/// la API lo trata como anónimo. El comprador sigue entrando desde su tienda.
/// </summary>
[Collection("api")]
public sealed class PanelOriginTests(ApiFactory factory)
{
    private const string PanelOrigin = "http://localhost:5173";

    [Fact]
    public async Task La_sesion_del_panel_vale_desde_el_panel_y_sin_Origin()
    {
        var merchant = await Merchant.CreateAsync(factory, "orig");
        Assert.Equal(HttpStatusCode.OK, await MeAsync(merchant, origin: null));
        Assert.Equal(HttpStatusCode.OK, await MeAsync(merchant, PanelOrigin));

        // Una escritura del panel, desde el panel.
        var req = new HttpRequestMessage(HttpMethod.Post, "/api/v1/products")
        {
            Content = JsonContent.Create(new { name = "Mate", priceMinor = 1000_00, currency = "ARS" }),
        };
        req.Headers.Add("X-Tenant-Id", merchant.TenantId.ToString());
        req.Headers.Add("Origin", PanelOrigin);
        var res = await merchant.Client.SendAsync(req);
        Assert.NotEqual(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Theory]
    [InlineData("tienda")]   // una tienda de la plataforma
    [InlineData("otro")]     // cualquier otro subdominio
    [InlineData("media")]    // el host de las fotos (Media:PublicBaseUrl)
    [InlineData("ajeno")]    // otro sitio
    public async Task Desde_otro_origen_la_sesion_del_panel_no_vale(string kind)
    {
        var merchant = await Merchant.CreateAsync(factory, "orig");
        var origin = kind switch
        {
            "tienda" => $"http://{merchant.Subdomain}.localhost:3000",
            "otro" => "http://admin.localhost:3000",
            "media" => "http://localhost:9000",
            _ => "https://sitio-malicioso.example",
        };

        Assert.Equal(HttpStatusCode.Unauthorized, await MeAsync(merchant, origin));

        // Ni para leer lo de la tienda ni para escribir.
        var list = new HttpRequestMessage(HttpMethod.Get, "/api/v1/orders");
        list.Headers.Add("X-Tenant-Id", merchant.TenantId.ToString());
        list.Headers.Add("Origin", origin);
        Assert.Equal(HttpStatusCode.Unauthorized, (await merchant.Client.SendAsync(list)).StatusCode);

        var write = new HttpRequestMessage(HttpMethod.Post, "/api/v1/products")
        {
            Content = JsonContent.Create(new { name = "Mate", priceMinor = 1000_00, currency = "ARS" }),
        };
        write.Headers.Add("X-Tenant-Id", merchant.TenantId.ToString());
        write.Headers.Add("Origin", origin);
        Assert.Equal(HttpStatusCode.Unauthorized, (await merchant.Client.SendAsync(write)).StatusCode);

        // La cookie no se borra: el admin sigue con su sesión en el panel.
        Assert.Equal(HttpStatusCode.OK, await MeAsync(merchant, PanelOrigin));
    }

    [Fact]
    public async Task El_comprador_entra_desde_su_tienda()
    {
        var merchant = await Merchant.CreateAsync(factory, "origc");
        var shopper = new Shopper(merchant);
        await shopper.RegisterVerifiedAsync($"origen-{Guid.NewGuid():N}@test.local");

        // Shopper manda el Origin de su tienda en cada pedido.
        await shopper.ExpectOkAsync(HttpMethod.Get, "/api/v1/shop/auth/me");
    }

    [Theory]
    [InlineData("http://localhost:5173", true)]        // el panel
    [InlineData("http://tienda.localhost:3000", true)] // una tienda
    [InlineData("http://localhost:9000", false)]       // el host de las fotos
    [InlineData("https://sitio-malicioso.example", false)]
    public async Task CORS_con_credenciales_solo_para_el_panel_y_las_tiendas(string origin, bool allowed)
    {
        var preflight = new HttpRequestMessage(HttpMethod.Options, "/api/v1/auth/me");
        preflight.Headers.Add("Origin", origin);
        preflight.Headers.Add("Access-Control-Request-Method", "GET");
        var res = await factory.CreateClient().SendAsync(preflight);
        var allowOrigin = res.Headers.TryGetValues("Access-Control-Allow-Origin", out var values) ? values.Single() : null;
        Assert.Equal(allowed ? origin : null, allowOrigin);
    }

    private static async Task<HttpStatusCode> MeAsync(Merchant merchant, string? origin)
    {
        var req = new HttpRequestMessage(HttpMethod.Get, "/api/v1/auth/me");
        if (origin is not null) req.Headers.Add("Origin", origin);
        return (await merchant.Client.SendAsync(req)).StatusCode;
    }
}
