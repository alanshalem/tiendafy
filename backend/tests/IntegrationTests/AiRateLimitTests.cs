using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using Ai.Infrastructure;
using static IntegrationTests.AiSetup;

namespace IntegrationTests;

/// <summary>
/// El cupo de IA es por usuario y ruta. Usa su propia fábrica porque el límite de la suite
/// (<c>RateLimiting:AiPermitLimit</c> alto, para que ningún test lo toque) acá se baja a 2.
/// </summary>
[Collection("api")]
public sealed class AiRateLimitTests : IClassFixture<AiRateLimitTests.LowLimitFactory>
{
    private const string ShortText = "/api/v1/ai/short-text";
    private readonly LowLimitFactory _factory;

    public AiRateLimitTests(LowLimitFactory factory) => _factory = factory;

    public sealed class LowLimitFactory : ApiFactory
    {
        protected override void ConfigureWebHost(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            builder.UseSetting("RateLimiting:AiPermitLimit", "2");
        }
    }

    [Fact]
    public async Task Ai_limita_por_usuario()
    {
        var owner = await Merchant.CreateAsync(_factory, "airl");
        await ConfigureAsync(owner, (AiTask.ShortText, Haiku));
        var other = await owner.AddTeammateAsync("admin", "airl2");
        var body = new { kind = "social-post", draft = "Hola" };
        _factory.Ai.Respond(Haiku, Reply("Uno."), Reply("Dos."), Reply("Tres."));

        Assert.Equal(HttpStatusCode.OK, (await owner.SendAsync(HttpMethod.Post, ShortText, body)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await owner.SendAsync(HttpMethod.Post, ShortText, body)).StatusCode);

        var limited = await owner.SendAsync(HttpMethod.Post, ShortText, body);
        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
        Assert.Equal("RateLimit.Exceeded", JsonDocument.Parse(await limited.Content.ReadAsStringAsync()).RootElement.GetProperty("title").GetString());
        Assert.Equal(2, _factory.Ai.Calls(Haiku).Count);

        // Otro usuario de la misma tienda tiene su propio cupo.
        Assert.Equal(HttpStatusCode.OK, (await other.SendAsync(HttpMethod.Post, ShortText, body)).StatusCode);
    }

    [Fact]
    public async Task El_cupo_cuenta_la_ruta_y_no_el_id_de_la_orden()
    {
        var m = await Merchant.CreateAsync(_factory, "airl3");
        var orders = new List<Guid>();
        for (var i = 0; i < 3; i++)
        {
            var po = await m.PostAsync("/api/v1/purchasing/purchase-orders",
                new { supplierName = "Proveedor", currency = "ARS", exchangeRate = 1m });
            orders.Add(po.GetProperty("id").GetGuid());
        }

        // Tres órdenes distintas comparten el cupo del usuario: la tercera lectura se corta.
        // (La IA no está configurada: las dos primeras terminan en 409, pero igual cuentan.)
        var statuses = new List<HttpStatusCode>();
        foreach (var id in orders)
        {
            using var form = new MultipartFormDataContent
            {
                { new ByteArrayContent("%PDF-1.4"u8.ToArray()) { Headers = { ContentType = new MediaTypeHeaderValue("application/pdf") } }, "file", "f.pdf" },
            };
            var req = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/purchasing/purchase-orders/{id}/invoice/scan") { Content = form };
            req.Headers.Add("X-Tenant-Id", m.TenantId.ToString());
            statuses.Add((await m.Client.SendAsync(req)).StatusCode);
        }

        Assert.Equal([HttpStatusCode.Conflict, HttpStatusCode.Conflict, HttpStatusCode.TooManyRequests], statuses);
    }
}
