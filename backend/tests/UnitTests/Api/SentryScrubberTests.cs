using Api.Startup;

namespace UnitTests.Api;

/// <summary>
/// Lo que llega a Sentry no lleva los secretos que viajan en una URL: el token
/// del bot de Telegram en el path, el access_token de Meta en la query, los
/// links firmados de los mails.
/// </summary>
public class SentryScrubberTests
{
    private const string BotToken = "123456789:AAH-x_YzSecretoDelBot0123456789abcd";

    [Fact]
    public void El_token_del_bot_de_Telegram_no_queda_en_el_path()
    {
        var redacted = SentryScrubber.Redact($"https://api.telegram.org/bot{BotToken}/sendMessage");

        Assert.Equal("https://api.telegram.org/bot[Filtered]/sendMessage", redacted);
        Assert.Equal("https://api.telegram.org/file/bot[Filtered]/photos/a.jpg",
            SentryScrubber.Redact($"https://api.telegram.org/file/bot{BotToken}/photos/a.jpg"));
    }

    [Fact]
    public void El_access_token_de_Meta_no_queda_en_la_query_y_el_resto_si()
    {
        var redacted = SentryScrubber.Redact(
            "https://graph.facebook.com/v21.0/123/feed?fields=id,message&access_token=EAAGsecreto&limit=5");

        Assert.Equal("https://graph.facebook.com/v21.0/123/feed?fields=id,message&access_token=[Filtered]&limit=5", redacted);
    }

    [Theory]
    [InlineData("https://x.test/oauth?client_secret=abc&client_id=1", "https://x.test/oauth?client_secret=[Filtered]&client_id=1")]
    [InlineData("https://x.test/a?token=abc", "https://x.test/a?token=[Filtered]")]
    [InlineData("https://x.test/a?key=abc&q=zapatillas", "https://x.test/a?key=[Filtered]&q=zapatillas")]
    [InlineData("https://x.test/a?api_key=abc", "https://x.test/a?api_key=[Filtered]")]
    [InlineData("https://x.test/a?secret=abc", "https://x.test/a?secret=[Filtered]")]
    [InlineData("https://x.test/a?password=abc#frag", "https://x.test/a?password=[Filtered]#frag")]
    [InlineData("https://x.test/a?fb_exchange_token=abc", "https://x.test/a?fb_exchange_token=[Filtered]")]
    [InlineData("https://api.tienda.test/api/v1/marketing/c?t=CfDJ8firmado", "https://api.tienda.test/api/v1/marketing/c?t=[Filtered]")]
    [InlineData("https://x.test/a?ACCESS_TOKEN=abc", "https://x.test/a?ACCESS_TOKEN=[Filtered]")]
    [InlineData("https://tienda.test/preview?pt=firmado&x=1", "https://tienda.test/preview?pt=[Filtered]&x=1")]
    public void Los_parametros_con_secretos_se_tapan(string url, string expected) =>
        Assert.Equal(expected, SentryScrubber.Redact(url));

    [Theory]
    [InlineData("https://apis.andreani.com/v1/tarifas?cpDestino=1043&contrato=300006611&bultos[0][kilos]=1")]
    [InlineData("https://api.tienda.test/api/v1/products?page=2&pageSize=20&sort=price")]
    [InlineData("https://api.telegram.org/getMe")]
    [InlineData("https://tienda.test/bottles/botines?keyword=rojo&monkey=1")]
    [InlineData("Se pisó una reserva vieja de envío de andreani para la venta 123.")]
    [InlineData("")]
    public void Una_url_sin_secretos_queda_igual(string text) =>
        Assert.Equal(text, SentryScrubber.Redact(text));

    [Fact]
    public void Tambien_tapa_la_url_metida_en_un_mensaje()
    {
        var message = $"Start processing HTTP request POST https://api.telegram.org/bot{BotToken}/sendPhoto?token=x";

        Assert.Equal("Start processing HTTP request POST https://api.telegram.org/bot[Filtered]/sendPhoto?token=[Filtered]",
            SentryScrubber.Redact(message));
    }

    [Fact]
    public void El_breadcrumb_de_una_llamada_http_sale_sin_secretos()
    {
        var crumb = new Breadcrumb(string.Empty, "http", new Dictionary<string, string>
        {
            ["url"] = $"https://api.telegram.org/bot{BotToken}/sendMessage",
            ["http.query"] = "access_token=EAAG&fields=id",
            ["method"] = "POST",
            ["status_code"] = "200",
        }, "http");

        var scrubbed = SentryScrubber.Scrub(crumb);

        Assert.Equal("https://api.telegram.org/bot[Filtered]/sendMessage", scrubbed.Data!["url"]);
        Assert.Equal("access_token=[Filtered]&fields=id", scrubbed.Data["http.query"]);
        Assert.Equal("POST", scrubbed.Data["method"]);
        Assert.Equal("http", scrubbed.Type);
        Assert.Equal("http", scrubbed.Category);
    }

    [Fact]
    public void Un_breadcrumb_sin_secretos_es_el_mismo()
    {
        var crumb = new Breadcrumb("algo pasó", "default", new Dictionary<string, string> { ["url"] = "https://x.test/a?b=1" });

        Assert.Same(crumb, SentryScrubber.Scrub(crumb));
    }

    [Fact]
    public void El_evento_sale_sin_secretos_en_el_pedido_ni_en_la_excepcion()
    {
        var evt = new SentryEvent
        {
            Message = new SentryMessage { Formatted = $"Falló https://api.telegram.org/bot{BotToken}/sendMessage" },
            SentryExceptions =
            [
                new Sentry.Protocol.SentryException
                {
                    Type = "HttpRequestException",
                    Value = "Error en https://graph.facebook.com/me?access_token=EAAG",
                },
            ],
        };
        evt.Request.Url = "https://api.tienda.test/api/v1/marketing/c?t=CfDJ8firmado";
        evt.Request.QueryString = "?t=CfDJ8firmado&u=https%3A%2F%2Ftienda.test";
        evt.Request.Headers["Authorization"] = "Bearer secreto";
        evt.Request.Headers["User-Agent"] = "Mozilla/5.0";

        var scrubbed = SentryScrubber.Scrub(evt);

        Assert.Equal("https://api.tienda.test/api/v1/marketing/c?t=[Filtered]", scrubbed.Request.Url);
        Assert.Equal("?t=[Filtered]&u=https%3A%2F%2Ftienda.test", scrubbed.Request.QueryString);
        Assert.Equal("[Filtered]", scrubbed.Request.Headers["Authorization"]);
        Assert.Equal("Mozilla/5.0", scrubbed.Request.Headers["User-Agent"]);
        Assert.Equal("Falló https://api.telegram.org/bot[Filtered]/sendMessage", scrubbed.Message!.Formatted);
        Assert.Equal("Error en https://graph.facebook.com/me?access_token=[Filtered]",
            Assert.Single(scrubbed.SentryExceptions!).Value);
    }

    [Fact]
    public void La_query_suelta_sin_signo_de_pregunta_tambien_se_tapa() =>
        Assert.Equal("a=1&token=[Filtered]", SentryScrubber.RedactQuery("a=1&token=x"));
}
