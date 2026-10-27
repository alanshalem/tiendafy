using System.Net;

namespace IntegrationTests;

/// <summary>
/// Cupos por IP y ruta de lo del comprador que solo tenía el techo global:
/// la sesión (<c>/shop/auth/me</c>) y "Entrar con Google" (arranque y vuelta).
/// </summary>
[Collection("api")]
public sealed class ShopAuthRateLimitTests(ApiFactory factory)
{
    private static async Task<List<HttpStatusCode>> HitAsync(HttpClient client, int times, Func<HttpRequestMessage> request)
    {
        var statuses = new List<HttpStatusCode>();
        for (var i = 0; i < times; i++) statuses.Add((await client.SendAsync(request())).StatusCode);
        return statuses;
    }

    [Fact]
    public async Task La_sesion_del_comprador_tiene_cupo_por_IP()
    {
        await using var app = factory.WithWebHostBuilder(b => b.UseSetting("RateLimiting:ShopSessionPermitLimit", "2"));
        var tenant = Guid.NewGuid().ToString();
        var me = await HitAsync(app.CreateClient(), 3, () =>
        {
            var req = new HttpRequestMessage(HttpMethod.Get, "/api/v1/shop/auth/me");
            req.Headers.Add("X-Tenant-Id", tenant);
            return req;
        });
        Assert.DoesNotContain(HttpStatusCode.TooManyRequests, me.Take(2));
        Assert.Equal(HttpStatusCode.TooManyRequests, me[2]);
    }

    [Fact]
    public async Task Entrar_con_Google_tiene_cupo_por_IP_en_el_arranque_y_en_la_vuelta()
    {
        await using var app = factory.WithWebHostBuilder(b => b.UseSetting("RateLimiting:GoogleAuthPermitLimit", "2"));
        var client = app.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

        var start = await HitAsync(client, 3, () => new HttpRequestMessage(HttpMethod.Get, $"/api/v1/shop/auth/google/start?tenant={Guid.NewGuid()}"));
        Assert.DoesNotContain(HttpStatusCode.TooManyRequests, start.Take(2));
        Assert.Equal(HttpStatusCode.TooManyRequests, start[2]);

        var callback = await HitAsync(client, 3, () => new HttpRequestMessage(HttpMethod.Get, "/api/v1/shop/auth/google/callback?code=a&state=b"));
        Assert.DoesNotContain(HttpStatusCode.TooManyRequests, callback.Take(2));
        Assert.Equal(HttpStatusCode.TooManyRequests, callback[2]);
    }
}
