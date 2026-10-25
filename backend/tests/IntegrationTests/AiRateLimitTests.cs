using System.Net;
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
}
