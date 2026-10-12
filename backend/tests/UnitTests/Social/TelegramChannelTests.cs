using System.Net;
using System.Text.Json;
using Api.Social;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Social.Contracts;

namespace UnitTests.Social;

/// <summary>
/// Publicar en Telegram con el bot de la tienda: qué método se usa según las
/// fotos, el texto largo que no entra como pie de foto (va aparte, no se
/// corta), el link al mensaje en canales públicos, y cómo se traducen los
/// errores (token revocado, demasiados pedidos, cualquier otro).
/// </summary>
public sealed class TelegramChannelTests
{
    private const string Token = """{"bot_token":"123:ABC","chat_id":"@mitienda"}""";

    private sealed class StubTelegram(params (HttpStatusCode Status, string Body)[] responses) : HttpMessageHandler
    {
        public List<(string Method, JsonElement Body)> Calls { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            var method = request.RequestUri!.Segments[^1];
            Calls.Add((method, JsonDocument.Parse(await request.Content!.ReadAsStringAsync(ct)).RootElement.Clone()));
            var (status, body) = responses[Math.Min(Calls.Count - 1, responses.Length - 1)];
            return new HttpResponseMessage(status) { Content = new StringContent(body) };
        }
    }

    private static TelegramChannel Channel(StubTelegram stub) =>
        new(new HttpClient(stub), Options.Create(new SocialOptions()), NullLogger<TelegramChannel>.Instance);

    private const string Sent = """{"ok":true,"result":{"message_id":42,"chat":{"username":"mitienda"}}}""";

    [Fact]
    public async Task Sin_bot_o_sin_chat_pide_reconectar()
    {
        var stub = new StubTelegram((HttpStatusCode.OK, Sent));
        var result = await Channel(stub).PublishAsync("""{"bot_token":""}""", null, "hola", [], CancellationToken.None);
        Assert.Equal(SocialPublishStatus.Unauthorized, result.Status);
        Assert.Empty(stub.Calls);
    }

    [Fact]
    public async Task Texto_solo_y_link_al_mensaje_del_canal_publico()
    {
        var stub = new StubTelegram((HttpStatusCode.OK, Sent));
        var result = await Channel(stub).PublishAsync(Token, null, "Llegó la temporada", [], CancellationToken.None);
        Assert.Equal(SocialPublishStatus.Ok, result.Status);
        Assert.Equal("https://t.me/mitienda/42", result.ExternalUrl);
        Assert.Equal("sendMessage", stub.Calls.Single().Method);
    }

    [Fact]
    public async Task Varias_fotos_van_como_album_y_el_texto_largo_sale_aparte()
    {
        var album = """{"ok":true,"result":[{"message_id":7,"chat":{}},{"message_id":8,"chat":{}}]}""";
        var stub = new StubTelegram((HttpStatusCode.OK, album), (HttpStatusCode.OK, Sent));
        var longText = new string('x', 1500); // más que el pie de foto (1024)

        var result = await Channel(stub).PublishAsync(Token, null, longText,
            ["https://cdn.example/a.jpg", "https://cdn.example/b.jpg"], CancellationToken.None);

        Assert.Equal(SocialPublishStatus.Ok, result.Status);
        Assert.Equal("7", result.ProviderPostId); // el primer mensaje del álbum representa el post
        Assert.Null(result.ExternalUrl);      // canal sin username: no hay link público
        Assert.Equal(["sendMediaGroup", "sendMessage"], stub.Calls.Select(c => c.Method));
        var media = stub.Calls[0].Body.GetProperty("media");
        Assert.Equal("", media[0].GetProperty("caption").GetString()); // no se corta el texto en el pie
        Assert.Equal(longText, stub.Calls[1].Body.GetProperty("text").GetString());
    }

    [Fact]
    public async Task Una_foto_con_pie_corto_va_en_un_solo_mensaje()
    {
        var stub = new StubTelegram((HttpStatusCode.OK, Sent));
        await Channel(stub).PublishAsync(Token, null, "Nueva", ["https://cdn.example/a.jpg"], CancellationToken.None);
        var call = stub.Calls.Single();
        Assert.Equal("sendPhoto", call.Method);
        Assert.Equal("Nueva", call.Body.GetProperty("caption").GetString());
    }

    [Fact]
    public async Task Si_el_texto_aparte_falla_el_post_falla()
    {
        var stub = new StubTelegram((HttpStatusCode.OK, Sent), (HttpStatusCode.BadRequest, """{"ok":false,"description":"Bad Request: message is too long"}"""));
        var result = await Channel(stub).PublishAsync(Token, null, new string('x', 5000), ["https://cdn.example/a.jpg"], CancellationToken.None);
        Assert.Equal(SocialPublishStatus.Error, result.Status);
        Assert.Contains("too long", result.Message, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData(HttpStatusCode.Unauthorized, SocialPublishStatus.Unauthorized)]
    [InlineData(HttpStatusCode.Forbidden, SocialPublishStatus.Unauthorized)]
    [InlineData(HttpStatusCode.BadRequest, SocialPublishStatus.Error)]
    public async Task Los_errores_de_Telegram_se_traducen(HttpStatusCode status, SocialPublishStatus expected)
    {
        var stub = new StubTelegram((status, """{"ok":false}"""));
        var result = await Channel(stub).PublishAsync(Token, null, "hola", [], CancellationToken.None);
        Assert.Equal(expected, result.Status);
    }

    [Fact]
    public async Task Demasiados_pedidos_dice_cuando_reintentar()
    {
        var withRetry = new StubTelegram((HttpStatusCode.TooManyRequests, """{"ok":false,"description":"Too Many Requests","parameters":{"retry_after":30}}"""));
        var limited = await Channel(withRetry).PublishAsync(Token, null, "hola", [], CancellationToken.None);
        Assert.Equal(SocialPublishStatus.RateLimited, limited.Status);
        Assert.Equal(TimeSpan.FromSeconds(30), limited.RetryAfter);

        // Sin el dato, un minuto.
        var noHint = new StubTelegram((HttpStatusCode.TooManyRequests, """{"ok":false}"""));
        Assert.Equal(TimeSpan.FromMinutes(1),
            (await Channel(noHint).PublishAsync(Token, null, "hola", [], CancellationToken.None)).RetryAfter);
    }

    [Fact]
    public async Task Validar_el_bot_devuelve_el_chat_o_el_motivo()
    {
        var ok = new StubTelegram((HttpStatusCode.OK, """{"ok":true,"result":{"id":-1001,"title":"Mi Tienda"}}"""));
        var chat = await Channel(ok).ValidateConnectionAsync("123:ABC", "@mitienda", CancellationToken.None);
        Assert.True(chat.IsSuccess);
        Assert.Equal("-1001", chat.Value.ProviderId);
        Assert.Equal("Mi Tienda", chat.Value.Name);

        var bad = new StubTelegram((HttpStatusCode.BadRequest, """{"ok":false,"description":"chat not found"}"""));
        var failed = await Channel(bad).ValidateConnectionAsync("123:ABC", "@nadie", CancellationToken.None);
        Assert.True(failed.IsFailure);
        Assert.Contains("chat not found", failed.Error.Message, StringComparison.Ordinal);
    }
}
