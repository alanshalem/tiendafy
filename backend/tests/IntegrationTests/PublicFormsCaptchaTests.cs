using System.Net;
using System.Text.Json;

namespace IntegrationTests;

/// <summary>
/// Newsletter, "avisame cuando ingrese" y el alta de reseñas piden el mismo
/// captcha que contacto y registro (Cloudflare Turnstile). Antes solo tenían
/// el honeypot y el cupo por IP: cada aviso termina en un email a la
/// dirección cargada, así que un bot con varias IPs llenaba la lista de la
/// tienda y le mandaba correo a quien quisiera.
/// </summary>
[Collection("api")]
public sealed class PublicFormsCaptchaTests(ApiFactory factory)
{
    private const string Siteverify = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
    private const string GoodToken = "token-resuelto";

    private static async Task<string?> TitleAsync(HttpResponseMessage res) =>
        (await res.Content.ReadFromJsonAsync<JsonElement>()).TryGetProperty("title", out var t) ? t.GetString() : null;

    [Fact]
    public async Task Newsletter_avisame_y_resenas_piden_captcha_cuando_esta_configurado()
    {
        var merchant = await Merchant.CreateAsync(factory, "cap");
        var (_, soldOut) = await merchant.CreateProductAsync("Agotado", priceMinor: 10_000_00, stock: 0);
        // Turnstile: solo el token resuelto pasa (como el siteverify de verdad).
        factory.ExternalHttp.On(HttpMethod.Post, Siteverify, (_, body) =>
            FakeHttp.Json(new { success = body?.Contains($"response={GoodToken}") == true }));

        await using var app = factory.WithWebHostBuilder(b =>
        {
            b.UseSetting("Captcha:Turnstile:SiteKey", "0x-site");
            b.UseSetting("Captcha:Turnstile:Secret", "0x-secret");
        });
        var client = app.CreateClient();
        Task<HttpResponseMessage> Post(string path, object body)
        {
            var req = new HttpRequestMessage(HttpMethod.Post, path) { Content = JsonContent.Create(body) };
            req.Headers.Add("X-Tenant-Id", merchant.TenantId.ToString());
            return client.SendAsync(req);
        }

        var email = $"bot-{merchant.Subdomain}@mail.com";

        // Sin token o con uno trucho, no.
        foreach (var captcha in new[] { null, "trucho" })
        {
            var news = await Post("/api/v1/newsletter", new { email, source = "footer", captcha });
            Assert.Equal(HttpStatusCode.BadRequest, news.StatusCode);
            Assert.Equal("Captcha.Failed", await TitleAsync(news));

            var alert = await Post("/api/v1/back-in-stock", new { variantId = soldOut, email, captcha });
            Assert.Equal(HttpStatusCode.BadRequest, alert.StatusCode);
            Assert.Equal("Captcha.Failed", await TitleAsync(alert));

            var review = await Post("/api/v1/reviews", new { token = "x", orderItemId = Guid.NewGuid(), rating = 5, body = "Excelente producto.", captcha });
            Assert.Equal(HttpStatusCode.BadRequest, review.StatusCode);
            Assert.Equal("Captcha.Failed", await TitleAsync(review));
        }

        // Con el token resuelto, pasan (la reseña sigue necesitando su link).
        Assert.Equal(HttpStatusCode.OK, (await Post("/api/v1/newsletter", new { email, source = "footer", captcha = GoodToken })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Post("/api/v1/back-in-stock", new { variantId = soldOut, email, captcha = GoodToken })).StatusCode);
        var withLink = await Post("/api/v1/reviews", new { token = "x", orderItemId = Guid.NewGuid(), rating = 5, body = "Excelente producto.", captcha = GoodToken });
        Assert.NotEqual("Captcha.Failed", await TitleAsync(withLink));
    }
}
