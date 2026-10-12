using System.Net;
using System.Text.Json;
using Api.Auth;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace IntegrationTests;

/// <summary>
/// Login del comprador con Google, de punta a punta: el arranque firma el
/// <c>state</c>, el callback lo valida, canjea el código, verifica el
/// id_token, da de alta (o vincula) al cliente, deja la sesión en la cookie
/// de la tienda y redirige solo a destinos propios.
///
/// <para>
/// Google es lo único simulado: el canje del código va al <see cref="FakeHttp"/>
/// y la verificación de la firma, a un validador falso (las llaves de Google
/// no se pueden fabricar). Todo lo demás corre de verdad.
/// </para>
/// </summary>
[Collection("api")]
public sealed class GoogleLoginTests(ApiFactory factory)
{
    private const string GoogleToken = "https://oauth2.googleapis.com/token";

    private sealed class FakeGoogle : IGoogleIdTokenValidator
    {
        public GoogleIdentity? Next { get; set; }

        public Task<GoogleIdentity?> ValidateAsync(string idToken, string clientId) =>
            Task.FromResult(idToken == "id-token-ok" && clientId == "google-client" ? Next : null);
    }

    private readonly FakeGoogle _google = new();

    /// <summary>La API con Google configurado y el validador falso.</summary>
    private WebApplicationFactory<Program> WithGoogle() => factory.WithWebHostBuilder(b =>
    {
        b.UseSetting("Authentication:Google:ClientId", "google-client");
        b.UseSetting("Authentication:Google:ClientSecret", "google-secret");
        b.ConfigureTestServices(s =>
        {
            s.RemoveAll<IGoogleIdTokenValidator>();
            s.AddSingleton<IGoogleIdTokenValidator>(_google);
        });
    });

    private static HttpClient NoRedirects(WebApplicationFactory<Program> app) =>
        app.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

    /// <summary>Arranca el login y devuelve el <c>state</c> firmado que viaja a Google.</summary>
    private static async Task<string> StartAsync(HttpClient client, Guid tenant, string returnUrl)
    {
        var res = await client.GetAsync($"/api/v1/shop/auth/google/start?tenant={tenant}&return={Uri.EscapeDataString(returnUrl)}");
        Assert.Equal(HttpStatusCode.Redirect, res.StatusCode);
        var location = res.Headers.Location!;
        Assert.Equal("accounts.google.com", location.Host);
        var query = System.Web.HttpUtility.ParseQueryString(location.Query);
        Assert.Equal("google-client", query["client_id"]);
        Assert.EndsWith("/api/v1/shop/auth/google/callback", query["redirect_uri"]);
        return query["state"]!;
    }

    private static string SessionCookie(HttpResponseMessage res, Guid tenant) =>
        res.Headers.GetValues("Set-Cookie").Single(c => c.StartsWith($"shop_{tenant:N}=", StringComparison.Ordinal));

    [Fact]
    public async Task Alta_con_Google_deja_la_sesion_y_vuelve_a_la_tienda()
    {
        var merchant = await Merchant.CreateAsync(factory, "ggl");
        var shopper = new Shopper(merchant);
        await using var app = WithGoogle();
        var client = NoRedirects(app);

        var configured = await client.GetFromJsonAsync<JsonElement>("/api/v1/shop/auth/google/configured");
        Assert.True(configured.GetProperty("configured").GetBoolean());
        var state = await StartAsync(client, merchant.TenantId, $"{shopper.ReturnUrl}/cuenta");

        factory.ExternalHttp.OnJson(HttpMethod.Post, GoogleToken, new { id_token = "id-token-ok" });
        var email = $"google-{merchant.Subdomain}@gmail.com";
        _google.Next = new GoogleIdentity("google-sub-1", email.ToUpperInvariant(), "Ana Google", EmailVerified: true);

        var callback = await client.GetAsync($"/api/v1/shop/auth/google/callback?code=abc&state={Uri.EscapeDataString(state)}");
        Assert.Equal(HttpStatusCode.Redirect, callback.StatusCode);
        Assert.Equal($"{shopper.ReturnUrl}/cuenta", callback.Headers.Location!.ToString());
        var cookie = SessionCookie(callback, merchant.TenantId);
        Assert.Contains("httponly", cookie, StringComparison.OrdinalIgnoreCase);

        // El canje del código mandó lo que Google pide.
        var exchange = factory.ExternalHttp.SentTo(GoogleToken).Last().Body!;
        Assert.Contains("code=abc", exchange, StringComparison.Ordinal);
        Assert.Contains("grant_type=authorization_code", exchange, StringComparison.Ordinal);

        // Con la cookie, /me es el cliente nuevo (email normalizado y ya verificado).
        var me = new HttpRequestMessage(HttpMethod.Get, "/api/v1/shop/auth/me");
        me.Headers.Add("X-Tenant-Id", merchant.TenantId.ToString());
        me.Headers.Add("Cookie", cookie.Split(';')[0]);
        var profile = await (await client.SendAsync(me)).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(email, profile.GetProperty("email").GetString());
        Assert.Equal("Ana Google", profile.GetProperty("name").GetString());

        // Volver a entrar vincula la misma cuenta; un destino ajeno se cambia por "/".
        var again = await StartAsync(client, merchant.TenantId, "https://phishing.example/robo");
        _google.Next = new GoogleIdentity("google-sub-1", email, null, EmailVerified: true);
        var second = await client.GetAsync($"/api/v1/shop/auth/google/callback?code=def&state={Uri.EscapeDataString(again)}");
        Assert.Equal(HttpStatusCode.Redirect, second.StatusCode);
        Assert.Equal("/", second.Headers.Location!.ToString());
    }

    [Fact]
    public async Task El_callback_rechaza_lo_que_no_viene_de_Google()
    {
        var merchant = await Merchant.CreateAsync(factory, "ggr");
        await using var app = WithGoogle();
        var client = NoRedirects(app);
        async Task<HttpStatusCode> Callback(string query) =>
            (await client.GetAsync($"/api/v1/shop/auth/google/callback?{query}")).StatusCode;

        // Sin parámetros, con state inventado o con un tenant que no es un id.
        Assert.Equal(HttpStatusCode.BadRequest, await Callback("code=abc"));
        Assert.Equal(HttpStatusCode.BadRequest, await Callback("code=abc&state=inventado"));
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/v1/shop/auth/google/start?tenant=x")).StatusCode);

        var state = Uri.EscapeDataString(await StartAsync(client, merchant.TenantId, "/"));

        // Google no valida el código.
        factory.ExternalHttp.OnJson(HttpMethod.Post, GoogleToken, new { error = "invalid_grant" }, HttpStatusCode.BadRequest);
        Assert.Equal(HttpStatusCode.BadGateway, await Callback($"code=abc&state={state}"));

        // Responde sin id_token.
        factory.ExternalHttp.OnJson(HttpMethod.Post, GoogleToken, new { access_token = "x" });
        Assert.Equal(HttpStatusCode.BadGateway, await Callback($"code=abc&state={state}"));

        // Un id_token que no pasa la verificación (firma, audiencia o vencimiento).
        factory.ExternalHttp.OnJson(HttpMethod.Post, GoogleToken, new { id_token = "falsificado" });
        Assert.Equal(HttpStatusCode.BadGateway, await Callback($"code=abc&state={state}"));

        // Válido pero sin email verificado: no se crea una cuenta con un email ajeno.
        factory.ExternalHttp.OnJson(HttpMethod.Post, GoogleToken, new { id_token = "id-token-ok" });
        _google.Next = new GoogleIdentity("google-sub-2", $"sin-verificar-{merchant.Subdomain}@gmail.com", "X", EmailVerified: false);
        Assert.Equal(HttpStatusCode.BadGateway, await Callback($"code=abc&state={state}"));
    }

    [Fact]
    public async Task Sin_el_secreto_de_Google_el_callback_no_corre()
    {
        await using var app = factory.WithWebHostBuilder(b => b.UseSetting("Authentication:Google:ClientId", "google-client"));
        var client = NoRedirects(app);
        Assert.Equal(HttpStatusCode.NotImplemented,
            (await client.GetAsync("/api/v1/shop/auth/google/callback?code=a&state=b")).StatusCode);
    }

    [Fact]
    public async Task El_validador_real_rechaza_un_token_que_no_es_de_Google()
    {
        var validator = factory.Services.GetRequiredService<IGoogleIdTokenValidator>();
        Assert.IsNotType<FakeGoogle>(validator);
        Assert.Null(await validator.ValidateAsync("esto-no-es-un-jwt", "google-client"));
    }
}
