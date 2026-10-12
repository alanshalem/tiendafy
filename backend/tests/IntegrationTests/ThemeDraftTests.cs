using System.Net;
using System.Text.Json;

namespace IntegrationTests;

/// <summary>
/// El borrador del editor de diseño: se valida la forma, el CSS propio se
/// limpia de todo lo que permitiría inyectar HTML o JavaScript (el storefront
/// lo mete crudo en un &lt;style&gt;), y el borrador solo lo ve el panel o el
/// iframe de vista previa con un token firmado de ESA tienda.
/// </summary>
[Collection("api")]
public sealed class ThemeDraftTests(ApiFactory factory)
{
    private static object Config(string? customCss = null, string primary = "10 20 30") => new
    {
        colors = new { primary, accent = "0 0 0", useAccent = false, bg = "255 255 255", text = "17 24 39" },
        sections = Array.Empty<object>(),
        customCss,
    };

    private static async Task<HttpStatusCode> ReadDraftAs(Merchant store, string? previewToken)
    {
        var req = new HttpRequestMessage(HttpMethod.Get, "/api/v1/theme/draft");
        req.Headers.Add("X-Tenant-Id", store.TenantId.ToString());
        if (previewToken is not null) req.Headers.Add("X-Preview-Token", previewToken);
        return (await store.Anonymous().SendAsync(req)).StatusCode;
    }

    [Fact]
    public async Task El_CSS_propio_no_puede_inyectar_HTML_ni_JavaScript()
    {
        var merchant = await Merchant.CreateAsync(factory, "thd");
        const string evil =
            "body{color:red}</style><script>alert(1)</script>" +
            "a{background:url(javascript:alert(2))} @IMPORT url(evil.css); div{width:Expression(alert(3))}" +
            " p{behavior:url(x.htc)} b{-moz-binding:url(x.xml)}";
        await merchant.ExpectOkAsync(HttpMethod.Put, "/api/v1/theme/draft", Config(evil));

        var css = (await merchant.GetAsync("/api/v1/theme/draft")).GetProperty("customCss").GetString()!;
        Assert.Contains("body{color:red}", css, StringComparison.Ordinal);       // lo legítimo queda
        Assert.DoesNotContain("<", css, StringComparison.Ordinal);               // ni </style> ni <script>
        foreach (var bad in new[] { "javascript:", "@import", "expression(", "behavior:", "-moz-binding" })
            Assert.DoesNotContain(bad, css, StringComparison.OrdinalIgnoreCase);

        // Publicar pasa por el mismo saneado.
        await merchant.ExpectOkAsync(HttpMethod.Post, "/api/v1/theme/publish", Config("</style><script>x</script>"));
        Assert.DoesNotContain("<", (await merchant.GetAsync("/api/v1/theme")).GetProperty("customCss").GetString()!, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Un_borrador_sin_colores_o_secciones_se_rechaza()
    {
        var merchant = await Merchant.CreateAsync(factory, "thv2");
        foreach (var bad in new object[] { new { colors = "rojo", sections = Array.Empty<object>() }, new { colors = new { } }, new[] { 1, 2 } })
        {
            Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Put, "/api/v1/theme/draft", bad)).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/theme/publish", bad)).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/theme/schedule",
                new { config = bad, atUtc = DateTime.UtcNow.AddDays(1) })).StatusCode);
        }

        // Programar: tiene que ser a futuro y a menos de un año.
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/theme/schedule",
            new { config = Config(), atUtc = DateTime.UtcNow.AddMinutes(-5) })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/theme/schedule",
            new { config = Config(), atUtc = DateTime.UtcNow.AddDays(400) })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/theme/schedule",
            new { config = Config() })).StatusCode);
    }

    [Fact]
    public async Task El_borrador_lo_ve_el_panel_o_la_vista_previa_con_token_de_esa_tienda()
    {
        var merchant = await Merchant.CreateAsync(factory, "thp");
        var other = await Merchant.CreateAsync(factory, "thp2");
        var token = (await merchant.PostAsync("/api/v1/theme/preview-token", new { })).GetProperty("token").GetString()!;
        var otherToken = (await other.PostAsync("/api/v1/theme/preview-token", new { })).GetProperty("token").GetString()!;

        Assert.Equal(HttpStatusCode.OK, await ReadDraftAs(merchant, token));
        Assert.NotEqual(HttpStatusCode.OK, await ReadDraftAs(merchant, null));
        Assert.NotEqual(HttpStatusCode.OK, await ReadDraftAs(merchant, "token-inventado"));
        // El token de otra tienda no abre el borrador de esta.
        Assert.NotEqual(HttpStatusCode.OK, await ReadDraftAs(merchant, otherToken));
    }

    [Fact]
    public async Task El_historial_guarda_las_ultimas_veinte_publicaciones()
    {
        var merchant = await Merchant.CreateAsync(factory, "thh");
        for (var i = 0; i < 23; i++)
            await merchant.ExpectOkAsync(HttpMethod.Post, "/api/v1/theme/publish", Config(primary: $"{i} 0 0"));

        var history = await merchant.GetAsync("/api/v1/theme/history");
        Assert.Equal(20, history.GetProperty("items").GetArrayLength());
    }
}
