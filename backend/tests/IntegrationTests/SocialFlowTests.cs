using System.Net;
using System.Text.Json;
using System.Web;
using Api.Social;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Social.Infrastructure;

namespace IntegrationTests;

/// <summary>
/// Redes sociales de punta a punta, con Meta, X y Telegram simulados en
/// <see cref="FakeHttp"/>: conectar (OAuth de Meta y de X con PKCE, bot de
/// Telegram por formulario) → componer un post para varias cuentas →
/// programarlo → el worker publica en cada red → errores por red.
/// </summary>
[Collection("api")]
public sealed class SocialFlowTests
{
    private const string Graph = "https://graph.facebook.com/v21.0";
    private const string XApi = "https://api.x.com/2";
    private const string Telegram = "https://api.telegram.org";

    private readonly ApiFactory _factory;

    public SocialFlowTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Conectar_las_tres_redes_publicar_y_ver_resultados()
    {
        var merchant = await Merchant.CreateAsync(_factory, "soc");
        var unique = merchant.Subdomain;

        var channels = await merchant.GetAsync("/api/v1/admin/social/channels");
        Assert.Contains(channels.GetProperty("connectors").EnumerateArray(), c => c.GetProperty("key").GetString() == "meta" && c.GetProperty("configured").GetBoolean());
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/admin/social/accounts/connect/myspace")).StatusCode);

        // Meta: code → token → token largo → páginas con su Instagram.
        var pageId = $"page-{unique}";
        var igId = $"ig-{unique}";
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Graph}/oauth/access_token", new { access_token = "EAAG-token", token_type = "bearer", expires_in = 5_184_000 });
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Graph}/me/accounts", new
        {
            data = new[]
            {
                new
                {
                    id = pageId, name = "Tienda en Facebook", username = "tiendafb", access_token = "page-token",
                    picture = new { data = new { url = "https://cdn.example/avatar.png" } },
                    instagram_business_account = new { id = igId, username = "tienda.ig", profile_picture_url = "https://cdn.example/ig.png" },
                },
            },
        });
        await ConnectAsync(merchant, "meta");

        // X: OAuth 2 con PKCE.
        var xUser = $"x-{unique}";
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{XApi}/oauth2/token", new { access_token = "x-access", refresh_token = "x-refresh", expires_in = 60 });
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{XApi}/users/me", new { data = new { id = xUser, name = "Tienda", username = "tiendax", profile_image_url = "https://cdn.example/x.png" } });
        var xAuth = await ConnectAsync(merchant, "x");
        Assert.Contains("code_challenge_method=S256", xAuth);
        Assert.Contains("code_verifier=", _factory.ExternalHttp.SentTo($"{XApi}/oauth2/token").Last().Body);

        // Telegram: bot + chat, validados con getChat.
        var bot = $"123:{unique}";
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/admin/social/accounts/telegram", new { botToken = "", chatId = "" })).StatusCode);
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Telegram}/bot{bot}/getChat", new { ok = true, result = new { id = -100123L, title = "Canal de la tienda", username = "canaltienda" } });
        await merchant.PostAsync("/api/v1/admin/social/accounts/telegram", new { botToken = bot, chatId = "@canaltienda" });

        var accounts = (await merchant.GetAsync("/api/v1/admin/social/accounts")).GetProperty("accounts").EnumerateArray().ToList();
        Assert.Equal(4, accounts.Count); // Facebook, Instagram, X y Telegram
        Guid Account(string provider) => accounts.Single(a => a.GetProperty("provider").GetString() == provider).GetProperty("id").GetGuid();

        // Reconectar repara, no duplica.
        await ConnectAsync(merchant, "meta");
        Assert.Equal(4, (await merchant.GetAsync("/api/v1/admin/social/accounts")).GetProperty("accounts").GetArrayLength());

        // Componer: validaciones.
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/admin/social/posts",
            new { content = "x", mediaUrls = new[] { "no-es-url" } })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/admin/social/posts",
            new { content = "x", targets = new[] { new { accountId = Guid.NewGuid() } } })).StatusCode);

        var image = "https://cdn.example/remera.png";
        var post = await merchant.PostAsync("/api/v1/admin/social/posts", new
        {
            content = "¡Llegó la temporada! Usá el cupón VERANO10.",
            mediaUrls = new[] { image },
            targets = new object[]
            {
                new { accountId = Account("meta_facebook") },
                new { accountId = Account("meta_instagram") },
                new { accountId = Account("x"), contentOverride = "Temporada nueva 🔥" },
                new { accountId = Account("telegram") },
            },
            couponCode = "VERANO10",
        });
        var postId = post.GetProperty("id").GetGuid();
        var edited = await merchant.PutAsync($"/api/v1/admin/social/posts/{postId}", new
        {
            content = "¡Llegó la temporada! Usá el cupón VERANO10 en toda la tienda.",
            mediaUrls = new[] { image },
            targets = new object[]
            {
                new { accountId = Account("meta_facebook") },
                new { accountId = Account("meta_instagram") },
                new { accountId = Account("x"), contentOverride = "Temporada nueva 🔥" },
                new { accountId = Account("telegram") },
            },
            couponCode = "VERANO10",
        });
        Assert.Equal(4, edited.GetProperty("targets").GetArrayLength());

        // Programar en el futuro, desprogramar, y publicar ya.
        Assert.Equal("Scheduled", (await merchant.PostAsync($"/api/v1/admin/social/posts/{postId}/schedule",
            new { scheduledAtUtc = DateTime.UtcNow.AddDays(1) })).GetProperty("status").GetString());
        Assert.Equal("Draft", (await merchant.PostAsync($"/api/v1/admin/social/posts/{postId}/unschedule", new { })).GetProperty("status").GetString());
        await merchant.PostAsync($"/api/v1/admin/social/posts/{postId}/schedule", new { scheduledAtUtc = (DateTime?)null });

        // Cada red contesta como la real.
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Graph}/{pageId}/photos", new { id = "photo-1" });
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Graph}/{pageId}/feed", new { id = $"{pageId}_post1" });
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Graph}/{igId}/media_publish", new { id = "ig-media-1" });
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Graph}/{igId}/media", new { id = "container-1" });
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Graph}/ig-media-1", new { permalink = "https://www.instagram.com/p/abc/" });
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{XApi}/oauth2/token", new { access_token = "x-access-2", refresh_token = "x-refresh-2", expires_in = 7200 });
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{XApi}/tweets", new { data = new { id = "tweet-1", text = "ok" } });
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Telegram}/bot{bot}/sendPhoto", new { ok = true, result = new { message_id = 77, chat = new { username = "canaltienda" } } });

        await PublishAsync(postId);
        var published = (await merchant.GetAsync("/api/v1/admin/social/posts")).GetProperty("posts").EnumerateArray()
            .Single(p => p.GetProperty("id").GetGuid() == postId);
        Assert.Equal("Published", published.GetProperty("status").GetString());
        var targets = published.GetProperty("targets").EnumerateArray().ToList();
        Assert.All(targets, t => Assert.Equal(JsonValueKind.Null, t.GetProperty("error").ValueKind));
        Assert.Contains(targets, t => t.GetProperty("externalUrl").GetString() == "https://www.instagram.com/p/abc/");
        Assert.Contains(targets, t => t.GetProperty("externalUrl").GetString() == "https://t.me/canaltienda/77");
        // El token de X vencía: se renovó al publicar.
        Assert.Contains("grant_type=refresh_token", _factory.ExternalHttp.SentTo($"{XApi}/oauth2/token").Last().Body);
        Assert.Contains("Temporada nueva", _factory.ExternalHttp.SentTo($"{XApi}/tweets").Last().Body);

        // Publicado ya no se edita.
        Assert.False(published.GetProperty("isEditable").GetBoolean());

        // Filtros del calendario.
        var inRange = await merchant.GetAsync($"/api/v1/admin/social/posts?from={DateTime.UtcNow.AddDays(-1):O}&to={DateTime.UtcNow.AddDays(1):O}&status=Published");
        Assert.Single(inRange.GetProperty("posts").EnumerateArray());

        // Borrar post y cuentas.
        await merchant.ExpectOkAsync(HttpMethod.Delete, $"/api/v1/admin/social/posts/{postId}");
        await merchant.ExpectOkAsync(HttpMethod.Delete, $"/api/v1/admin/social/posts/{postId}");
        await merchant.ExpectOkAsync(HttpMethod.Delete, $"/api/v1/admin/social/accounts/{Account("telegram")}");
        await merchant.ExpectOkAsync(HttpMethod.Delete, $"/api/v1/admin/social/accounts/{Account("telegram")}");
        Assert.Equal(HttpStatusCode.NotFound, (await merchant.SendAsync(HttpMethod.Post, $"/api/v1/admin/social/posts/{Guid.NewGuid()}/unschedule")).StatusCode);
    }

    [Fact]
    public async Task Cada_red_explica_su_error()
    {
        var merchant = await Merchant.CreateAsync(_factory, "soe");
        var unique = merchant.Subdomain;
        var pageId = $"page-{unique}";
        var igId = $"ig-{unique}";
        var bot = $"456:{unique}";

        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Graph}/oauth/access_token", new { access_token = "EAAG", expires_in = 100 });
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Graph}/me/accounts", new
        {
            data = new[] { new { id = pageId, name = "Página", access_token = "page-token", instagram_business_account = new { id = igId, username = "ig" } } },
        });
        await ConnectAsync(merchant, "meta");
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{XApi}/oauth2/token", new { access_token = "x-access", refresh_token = "x-refresh", expires_in = 7200 });
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{XApi}/users/me", new { data = new { id = $"x-{unique}", name = "T", username = "t" } });
        await ConnectAsync(merchant, "x");
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Telegram}/bot{bot}/getChat", new { ok = true, result = new { id = 999L, first_name = "Ana" } });
        await merchant.PostAsync("/api/v1/admin/social/accounts/telegram", new { botToken = bot, chatId = "999" });

        var accounts = (await merchant.GetAsync("/api/v1/admin/social/accounts")).GetProperty("accounts").EnumerateArray()
            .ToDictionary(a => a.GetProperty("provider").GetString()!, a => a.GetProperty("id").GetGuid());

        // Facebook: token muerto (190). Instagram: sin imagen. X: rate limit. Telegram: 403.
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Graph}/{pageId}/feed", new { error = new { code = 190, message = "Token expirado" } }, HttpStatusCode.BadRequest);
        _factory.ExternalHttp.On(HttpMethod.Post, $"{XApi}/tweets", (_, _) => new HttpResponseMessage(HttpStatusCode.TooManyRequests));
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Telegram}/bot{bot}/sendMessage", new { ok = false, description = "Forbidden: bot was blocked" }, HttpStatusCode.Forbidden);

        var post = await merchant.PostAsync("/api/v1/admin/social/posts", new
        {
            content = "Texto sin imagen",
            targets = accounts.Values.Select(id => new { accountId = id }).ToArray(),
        });
        var postId = post.GetProperty("id").GetGuid();
        await merchant.PostAsync($"/api/v1/admin/social/posts/{postId}/schedule", new { });
        await PublishAsync(postId);

        var failed = (await merchant.GetAsync("/api/v1/admin/social/posts")).GetProperty("posts")[0];
        Assert.Equal("Failed", failed.GetProperty("status").GetString());
        Assert.All(failed.GetProperty("targets").EnumerateArray(), t => Assert.Equal(JsonValueKind.String, t.GetProperty("error").ValueKind));

        // Facebook y Telegram quedan pidiendo reconectar.
        var after = (await merchant.GetAsync("/api/v1/admin/social/accounts")).GetProperty("accounts").EnumerateArray()
            .ToDictionary(a => a.GetProperty("provider").GetString()!, a => a.GetProperty("authorized").GetBoolean());
        Assert.False(after["meta_facebook"]);
        Assert.False(after["telegram"]);

        // Un post a una cuenta desautorizada falla sin salir a la red.
        var second = await merchant.PostAsync("/api/v1/admin/social/posts", new
        {
            content = "Otro",
            targets = new[] { new { accountId = accounts["meta_facebook"] } },
        });
        await merchant.PostAsync($"/api/v1/admin/social/posts/{second.GetProperty("id").GetGuid()}/schedule", new { });
        await PublishAsync(second.GetProperty("id").GetGuid());

        // Telegram rechaza el bot al conectar.
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Telegram}/bot000:malo/getChat", new { ok = false, description = "Unauthorized" }, HttpStatusCode.Unauthorized);
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/admin/social/accounts/telegram",
            new { botToken = "000:malo", chatId = "1" })).StatusCode);

        // OAuth fallidos: sin code, state trucho, red desconocida, Meta sin páginas, X que rechaza.
        var browser = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        Assert.EndsWith("social=error", (await browser.GetAsync("/api/v1/social/oauth/callback/meta")).Headers.Location!.ToString());
        Assert.EndsWith("social=error", (await browser.GetAsync("/api/v1/social/oauth/callback/meta?code=x&state=trucho")).Headers.Location!.ToString());
        Assert.EndsWith("social=error", (await CallbackAsync(merchant, "meta", connector: "myspace")).Headers.Location!.ToString());
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Graph}/me/accounts", new { data = Array.Empty<object>() });
        Assert.EndsWith("social=error", (await CallbackAsync(merchant, "meta")).Headers.Location!.ToString());
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{XApi}/oauth2/token", new { error = "invalid_grant" }, HttpStatusCode.BadRequest);
        Assert.EndsWith("social=error", (await CallbackAsync(merchant, "x")).Headers.Location!.ToString());
    }

    // ---------------------------------------------------------------- helpers

    /// <summary>El OAuth completo de una red: pedir la URL y volver por el callback.</summary>
    private async Task<string> ConnectAsync(Merchant merchant, string connector)
    {
        var start = await merchant.PostAsync($"/api/v1/admin/social/accounts/connect/{connector}", new { });
        var authUrl = start.GetProperty("authUrl").GetString()!;
        var state = HttpUtility.ParseQueryString(new Uri(authUrl).Query)["state"]!;
        var browser = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var callback = await browser.GetAsync($"/api/v1/social/oauth/callback/{connector}?code=code-{connector}&state={Uri.EscapeDataString(state)}");
        Assert.EndsWith("social=connected", callback.Headers.Location!.ToString());
        return authUrl;
    }

    private async Task<HttpResponseMessage> CallbackAsync(Merchant merchant, string startWith, string? connector = null)
    {
        var start = await merchant.PostAsync($"/api/v1/admin/social/accounts/connect/{startWith}", new { });
        var state = HttpUtility.ParseQueryString(new Uri(start.GetProperty("authUrl").GetString()!).Query)["state"]!;
        var browser = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        return await browser.GetAsync($"/api/v1/social/oauth/callback/{connector ?? startWith}?code=c&state={Uri.EscapeDataString(state)}");
    }

    /// <summary>Pasadas del worker hasta que el post termine (la base persiste entre corridas).</summary>
    private async Task PublishAsync(Guid postId)
    {
        for (var pass = 0; pass < 20; pass++)
        {
            await Workers.RunOnceAsync<SocialPublishWorker>(_factory);
            using var scope = _factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<SocialDbContext>();
            if (await db.Posts.IgnoreQueryFilters().AnyAsync(p => p.Id == postId && p.ScheduleStatus == SocialScheduleStatus.Processed)) return;
        }
        Assert.Fail($"El post {postId} no se publicó.");
    }
}
