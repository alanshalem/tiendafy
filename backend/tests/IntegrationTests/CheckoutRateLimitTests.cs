using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;

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

    /// <summary>
    /// El cupo de fábrica para pagar: en Argentina los celulares comparten IPv4
    /// (CGNAT), y en un pico (Hot Sale) muchos compradores detrás de la misma
    /// IP pagan en pocos minutos. Con 10, el undécimo recibía 429 al pagar.
    /// </summary>
    [Fact]
    public async Task Por_defecto_enviar_un_checkout_admite_30_cada_10_minutos_por_IP()
    {
        // Sin el valor de la suite ni el de desarrollo: el de fábrica.
        await using var app = factory.WithWebHostBuilder(b =>
            b.UseSetting("RateLimiting:CheckoutPermitLimit", null));
        var client = app.CreateClient();

        var submit = await HitAsync(client, 31, _ => Post($"/api/v1/checkout/{Guid.NewGuid()}/submit", new { email = "a@b.com" }));
        Assert.DoesNotContain(HttpStatusCode.TooManyRequests, submit.Take(30));
        Assert.Equal(HttpStatusCode.TooManyRequests, submit[30]);
    }

    /// <summary>Pone la IP del cliente desde un header de prueba, antes de los cupos (como Caddy con X-Forwarded-For).</summary>
    private sealed class TestClientIp : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
        {
            app.Use((ctx, nextMiddleware) =>
            {
                if (ctx.Request.Headers.TryGetValue("X-Test-Ip", out var ip))
                    ctx.Connection.RemoteIpAddress = System.Net.IPAddress.Parse(ip.ToString());
                return nextMiddleware(ctx);
            });
            next(app);
        };
    }

    /// <summary>
    /// Cada compra enviada reserva stock media hora: con pocas IP (y en IPv6,
    /// cambiando de dirección dentro de la misma /64) un script dejaba sin stock
    /// vendible a una tienda. Hay tope de compras con reserva viva por cliente.
    /// </summary>
    [Fact]
    public async Task Hay_tope_de_compras_con_stock_reservado_por_cliente_y_la_red_interna_no_lo_tiene()
    {
        var merchant = await Merchant.CreateAsync(factory, "rsv");
        var (_, variantId) = await merchant.CreateProductAsync("Variante escasa", priceMinor: 1_000_00, stock: 50);
        await using var app = factory.WithWebHostBuilder(b =>
        {
            b.UseSetting("RateLimiting:CheckoutReservationsPerIp", "2");
            b.UseSetting("ForwardedHeaders:KnownNetworks:0", "10.0.0.0/8");
            b.ConfigureServices(s => s.AddSingleton<IStartupFilter, TestClientIp>());
        });
        var client = app.CreateClient();

        async Task<HttpResponseMessage> SubmitFromAsync(string ip)
        {
            var start = new HttpRequestMessage(HttpMethod.Post, "/api/v1/checkout")
            {
                Content = JsonContent.Create(new { lines = new[] { new { variantId, quantity = 1 } } }),
            };
            start.Headers.Add("X-Tenant-Id", merchant.TenantId.ToString());
            start.Headers.Add("X-Test-Ip", ip);
            var session = await (await client.SendAsync(start)).Content.ReadFromJsonAsync<JsonElement>();

            var submit = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/checkout/{session.GetProperty("id").GetGuid()}/submit")
            {
                Content = JsonContent.Create(new { email = "comprador@test.local", name = "Ana", lastName = "Pérez" }),
            };
            submit.Headers.Add("X-Tenant-Id", merchant.TenantId.ToString());
            submit.Headers.Add("X-Test-Ip", ip);
            return await client.SendAsync(submit);
        }

        // Dos compras desde la misma /64 (cambiando de dirección) entran; la tercera no.
        Assert.Equal(HttpStatusCode.OK, (await SubmitFromAsync("2001:db8:aa:1::1")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await SubmitFromAsync("2001:db8:aa:1::2")).StatusCode);
        var third = await SubmitFromAsync("2001:db8:aa:1:ffff::3");
        Assert.Equal(HttpStatusCode.TooManyRequests, third.StatusCode);
        Assert.Equal("Checkout.TooManyOpen", (await third.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("title").GetString());
        Assert.True(third.Headers.RetryAfter?.Delta > TimeSpan.Zero);

        // Otra /64 es otro cliente; nuestra red interna (el SSR) no tiene tope.
        Assert.Equal(HttpStatusCode.OK, (await SubmitFromAsync("2001:db8:aa:2::1")).StatusCode);
        for (var i = 0; i < 3; i++)
            Assert.Equal(HttpStatusCode.OK, (await SubmitFromAsync("10.1.2.3")).StatusCode);
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
