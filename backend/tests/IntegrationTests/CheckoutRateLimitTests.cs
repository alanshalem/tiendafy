using System.Net;

namespace IntegrationTests;

/// <summary>
/// Cupos por IP de lo público de la tienda que antes solo tenía el techo
/// global (300 por minuto): armar y enviar un checkout (reserva stock),
/// cotizar envíos (le pega a la API del carrier), buscar y el beacon de
/// visitas. Cada ruta cuenta aparte, y una ruta con id cuenta como una sola:
/// cambiar el id del checkout no da cupo nuevo.
/// </summary>
[Collection("api")]
public sealed class CheckoutRateLimitTests(ApiFactory factory)
{
    private static async Task<List<HttpStatusCode>> HitAsync(HttpClient client, int times, Func<int, HttpRequestMessage> request)
    {
        var statuses = new List<HttpStatusCode>();
        for (var i = 0; i < times; i++) statuses.Add((await client.SendAsync(request(i))).StatusCode);
        return statuses;
    }

    private static HttpRequestMessage Post(string path, object body) =>
        new(HttpMethod.Post, path) { Content = JsonContent.Create(body) };

    [Fact]
    public async Task Armar_y_enviar_checkouts_tiene_cupo_por_IP_aunque_cambie_el_id()
    {
        await using var app = factory.WithWebHostBuilder(b =>
            b.UseSetting("RateLimiting:CheckoutPermitLimit", "2"));
        var client = app.CreateClient();

        var start = await HitAsync(client, 3, _ => Post("/api/v1/checkout", new { lines = Array.Empty<object>() }));
        Assert.DoesNotContain(HttpStatusCode.TooManyRequests, start.Take(2));
        Assert.Equal(HttpStatusCode.TooManyRequests, start[2]);

        // Enviar cuenta aparte de armar, y cada intento con otro id es el mismo cupo.
        var submit = await HitAsync(client, 3, _ => Post($"/api/v1/checkout/{Guid.NewGuid()}/submit", new { email = "a@b.com" }));
        Assert.DoesNotContain(HttpStatusCode.TooManyRequests, submit.Take(2));
        Assert.Equal(HttpStatusCode.TooManyRequests, submit[2]);
    }

    [Fact]
    public async Task Cotizar_buscar_y_el_beacon_de_visitas_tienen_cupo_por_IP()
    {
        await using var app = factory.WithWebHostBuilder(b =>
        {
            b.UseSetting("RateLimiting:ShippingQuotePermitLimit", "2");
            b.UseSetting("RateLimiting:SearchPermitLimit", "2");
            b.UseSetting("RateLimiting:TrackPermitLimit", "2");
        });
        var client = app.CreateClient();

        foreach (var carrier in new[] { "correo", "zipnova", "andreani" })
        {
            var quotes = await HitAsync(client, 3, _ => Post($"/api/v1/shipping/{carrier}/quote", new { postalCode = "1414" }));
            Assert.DoesNotContain(HttpStatusCode.TooManyRequests, quotes.Take(2));
            Assert.Equal(HttpStatusCode.TooManyRequests, quotes[2]);
        }

        var suggest = await HitAsync(client, 3, i => new HttpRequestMessage(HttpMethod.Get, $"/api/v1/products/suggest?q=mate{i}"));
        Assert.Equal(HttpStatusCode.TooManyRequests, suggest[2]);
        var search = await HitAsync(client, 3, i => new HttpRequestMessage(HttpMethod.Get, $"/api/v1/products/search?q=mate{i}"));
        Assert.Equal(HttpStatusCode.TooManyRequests, search[2]);
        var log = await HitAsync(client, 3, i => Post("/api/v1/search/log", new { q = $"mate{i}" }));
        Assert.Equal(HttpStatusCode.TooManyRequests, log[2]);

        var track = await HitAsync(client, 3, i => Post("/api/v1/track", new { path = $"/p/{i}" }));
        Assert.DoesNotContain(HttpStatusCode.TooManyRequests, track.Take(2));
        Assert.Equal(HttpStatusCode.TooManyRequests, track[2]);
    }
}
