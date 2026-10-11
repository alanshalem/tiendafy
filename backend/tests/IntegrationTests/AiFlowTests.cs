using System.Net;

namespace IntegrationTests;

/// <summary>
/// Las sugerencias con IA del panel (respuesta a una pregunta de Mercado
/// Libre, al chat posventa, un post para redes, una descripción de producto),
/// con la API de Claude simulada en <see cref="FakeHttp"/>. Se prueba lo que
/// manda la API —modelo, clave, consigna— y que un fallo de la IA no rompa nada.
/// </summary>
[Collection("api")]
public sealed class AiFlowTests
{
    private const string Claude = "https://api.anthropic.com/v1/messages";
    private readonly ApiFactory _factory;

    public AiFlowTests(ApiFactory factory) => _factory = factory;

    public static TheoryData<string, object, object> Sugerencias() => new()
    {
        { "/api/v1/ai/ml-answer", new { question = "¿Sirve para talle L?", itemTitle = "Remera" }, new { question = "" } },
        { "/api/v1/ai/support-reply", new { message = "¿Cuándo llega?", orderSummary = "Pedido #123, enviado ayer" }, new { message = " " } },
        { "/api/v1/ai/social-post", new { draft = "Remeras nuevas con VERANO10" }, new { draft = "", productName = "" } },
        { "/api/v1/ai/product-description", new { name = "Remera", notes = "algodón" }, new { name = "" } },
    };

    [Theory]
    [MemberData(nameof(Sugerencias))]
    public async Task Sugiere_valida_y_sobrevive_a_un_fallo(string path, object ok, object empty)
    {
        var merchant = await Merchant.CreateAsync(_factory, "ai");
        Assert.True((await merchant.GetAsync("/api/v1/ai/status")).GetProperty("enabled").GetBoolean());

        _factory.ExternalHttp.OnJson(HttpMethod.Post, Claude, new { content = new[] { new { type = "text", text = "  Sugerencia lista.  " } } });
        var suggestion = await merchant.PostAsync(path, ok);
        Assert.Equal("Sugerencia lista.", suggestion.GetProperty("text").GetString());
        var sent = _factory.ExternalHttp.SentTo(Claude).Last();
        Assert.Equal("sk-ant-test", sent.Headers["x-api-key"]);
        Assert.Contains("\"system\":", sent.Body);

        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post, path, empty)).StatusCode);

        // La IA falla o contesta vacío: error explicado, no una excepción.
        _factory.ExternalHttp.OnJson(HttpMethod.Post, Claude, new { type = "error", error = new { type = "overloaded_error" } }, HttpStatusCode.ServiceUnavailable);
        Assert.False((await merchant.SendAsync(HttpMethod.Post, path, ok)).IsSuccessStatusCode);
        _factory.ExternalHttp.OnJson(HttpMethod.Post, Claude, new { content = Array.Empty<object>() });
        Assert.False((await merchant.SendAsync(HttpMethod.Post, path, ok)).IsSuccessStatusCode);
    }
}
