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

    private static object WithSections(params object[] sections) => new
    {
        colors = new { primary = "1 2 3", accent = "0 0 0", useAccent = false, bg = "255 255 255", text = "17 24 39" },
        sections,
    };

    [Fact]
    public async Task Una_seccion_rota_se_rechaza_con_un_mensaje_que_la_nombra()
    {
        var merchant = await Merchant.CreateAsync(factory, "thsec");
        var broken = new object[]
        {
            WithSections(new object?[] { null }),
            WithSections(new { id = "a", type = "no-existe", visible = true, data = new { } }),
            WithSections(new { id = "a", type = "faq", visible = true, data = (object?)null }),
            WithSections(new { id = "a", type = "promo-banners", visible = true, data = new { banners = new object?[] { null } } }),
            WithSections(new { id = "a", type = "image-text", visible = true, data = new { link = "javascript:alert(1)" } }),
            WithSections(new { id = "a", type = "institutional", visible = true, data = new { title = new string('x', 201) } }),
        };
        foreach (var body in broken)
        {
            foreach (var (method, path) in new[] { (HttpMethod.Put, "/api/v1/theme/draft"), (HttpMethod.Post, "/api/v1/theme/publish") })
            {
                var res = await merchant.SendAsync(method, path, body);
                Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
                var problem = await res.Content.ReadFromJsonAsync<JsonElement>();
                Assert.Equal("Theme.InvalidSection", problem.GetProperty("title").GetString());
                Assert.StartsWith("La sección 1", problem.GetProperty("detail").GetString(), StringComparison.Ordinal);
                Assert.True(problem.GetProperty("errors").GetArrayLength() > 0);
            }
        }

        // Una sección bien armada, con nombre propio, estilo y dispositivo, pasa y vuelve tal cual.
        await merchant.ExpectOkAsync(HttpMethod.Put, "/api/v1/theme/draft", WithSections(new
        {
            id = "faq-1",
            type = "faq",
            visible = true,
            name = "Dudas de envío",
            hideOn = "desktop",
            style = new { background = "subtle", paddingTop = "lg" },
            data = new { title = "Preguntas", items = new[] { new { question = "¿Envían?", answer = "Sí.", label = "Envíos" } } },
        }));
        var saved = (await merchant.GetAsync("/api/v1/theme/draft")).GetProperty("sections")[0];
        Assert.Equal("Dudas de envío", saved.GetProperty("name").GetString());
        Assert.Equal("Envíos", saved.GetProperty("data").GetProperty("items")[0].GetProperty("label").GetString());
    }

    [Fact]
    public async Task El_borrador_lleva_version_y_no_se_pisa_lo_que_cambio_otra_pestana()
    {
        var merchant = await Merchant.CreateAsync(factory, "thver");
        var v0 = (await merchant.GetAsync("/api/v1/theme/draft")).GetProperty("draftVersion").GetInt32();

        // Pestaña A guarda sobre la versión que leyó: pasa y la versión sube.
        var saved = await merchant.SendAsync(HttpMethod.Put, "/api/v1/theme/draft", new
        {
            colors = new { primary = "1 1 1" },
            sections = Array.Empty<object>(),
            draftVersion = v0,
        });
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        var v1 = (await saved.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("draftVersion").GetInt32();
        Assert.Equal(v0 + 1, v1);

        // La versión no se guarda dentro del diseño.
        var draft = await merchant.GetAsync("/api/v1/theme/draft");
        Assert.Equal(v1, draft.GetProperty("draftVersion").GetInt32());
        Assert.Equal("1 1 1", draft.GetProperty("colors").GetProperty("primary").GetString());

        // Pestaña B todavía tiene la versión vieja: guardar y publicar se rechazan.
        var stale = new { colors = new { primary = "2 2 2" }, sections = Array.Empty<object>(), draftVersion = v0 };
        foreach (var (method, path) in new[] { (HttpMethod.Put, "/api/v1/theme/draft"), (HttpMethod.Post, "/api/v1/theme/publish") })
        {
            var res = await merchant.SendAsync(method, path, stale);
            Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
            var problem = await res.Content.ReadFromJsonAsync<JsonElement>();
            Assert.Equal("El diseño cambió en otra pestaña o lo editó otra persona.", problem.GetProperty("detail").GetString());
            Assert.Equal(v1, problem.GetProperty("currentVersion").GetInt32());
        }
        Assert.Equal("1 1 1", (await merchant.GetAsync("/api/v1/theme/draft")).GetProperty("colors").GetProperty("primary").GetString());

        // "Guardar el mío igual": con la versión actual, pasa. Publicar devuelve la nueva.
        var published = await merchant.SendAsync(HttpMethod.Post, "/api/v1/theme/publish",
            new { colors = new { primary = "2 2 2" }, sections = Array.Empty<object>(), draftVersion = v1 });
        Assert.Equal(HttpStatusCode.OK, published.StatusCode);
        Assert.Equal(v1 + 1, (await published.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("draftVersion").GetInt32());
        Assert.False((await merchant.GetAsync("/api/v1/theme")).TryGetProperty("draftVersion", out _));
    }

    [Fact]
    public async Task Una_tienda_nueva_arranca_con_el_tema_por_defecto_del_registro()
    {
        var merchant = await Merchant.CreateAsync(factory, "thdef");
        var published = await merchant.GetAsync("/api/v1/theme");
        var expected = JsonDocument.Parse(Themes.Infrastructure.ThemeContract.DefaultConfigJson).RootElement;
        Assert.Equal(expected.GetProperty("schemaVersion").GetInt32(), published.GetProperty("schemaVersion").GetInt32());
        Assert.Equal(expected.GetProperty("sections").GetArrayLength(), published.GetProperty("sections").GetArrayLength());
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
