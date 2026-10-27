using System.Net;
using System.Text.Json;
using Api.Auth;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
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
        // Cada vuelta de Google gasta el nonce del navegador: se arranca de nuevo.
        async Task<HttpStatusCode> FreshCallback() =>
            await Callback($"code=abc&state={Uri.EscapeDataString(await StartAsync(client, merchant.TenantId, "/"))}");

        // Sin parámetros, con state inventado o con un tenant que no es un id.
        Assert.Equal(HttpStatusCode.BadRequest, await Callback("code=abc"));
        Assert.Equal(HttpStatusCode.BadRequest, await Callback("code=abc&state=inventado"));
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/v1/shop/auth/google/start?tenant=x")).StatusCode);

        // Google no valida el código.
        factory.ExternalHttp.OnJson(HttpMethod.Post, GoogleToken, new { error = "invalid_grant" }, HttpStatusCode.BadRequest);
        Assert.Equal(HttpStatusCode.BadGateway, await FreshCallback());

        // Responde sin id_token.
        factory.ExternalHttp.OnJson(HttpMethod.Post, GoogleToken, new { access_token = "x" });
        Assert.Equal(HttpStatusCode.BadGateway, await FreshCallback());

        // Un id_token que no pasa la verificación (firma, audiencia o vencimiento).
        factory.ExternalHttp.OnJson(HttpMethod.Post, GoogleToken, new { id_token = "falsificado" });
        Assert.Equal(HttpStatusCode.BadGateway, await FreshCallback());

        // Válido pero sin email verificado: no se crea una cuenta con un email ajeno.
        factory.ExternalHttp.OnJson(HttpMethod.Post, GoogleToken, new { id_token = "id-token-ok" });
        _google.Next = new GoogleIdentity("google-sub-2", $"sin-verificar-{merchant.Subdomain}@gmail.com", "X", EmailVerified: false);
        Assert.Equal(HttpStatusCode.BadGateway, await FreshCallback());
    }

    [Fact]
    public async Task El_callback_sin_la_cookie_del_navegador_que_empezo_se_rechaza()
    {
        var merchant = await Merchant.CreateAsync(factory, "ggc");
        await using var app = WithGoogle();
        var victim = NoRedirects(app);
        var attacker = NoRedirects(app);
        factory.ExternalHttp.OnJson(HttpMethod.Post, GoogleToken, new { id_token = "id-token-ok" });
        _google.Next = new GoogleIdentity("google-sub-atk", $"atacante-{merchant.Subdomain}@gmail.com", "Atacante", EmailVerified: true);

        // El atacante empieza el login y le pasa a otro el link de vuelta con
        // SU código (login CSRF): el navegador de la víctima no tiene la cookie.
        var state = Uri.EscapeDataString(await StartAsync(attacker, merchant.TenantId, "/"));
        var forged = await victim.GetAsync($"/api/v1/shop/auth/google/callback?code=abc&state={state}");
        Assert.Equal(HttpStatusCode.BadRequest, forged.StatusCode);
        var forgedCookies = forged.Headers.TryGetValues("Set-Cookie", out var set) ? set.ToList() : [];
        Assert.DoesNotContain(forgedCookies, c => c.StartsWith($"shop_{merchant.TenantId:N}=", StringComparison.Ordinal));

        // Con la cookie de OTRO arranque (otro nonce), tampoco.
        await StartAsync(victim, merchant.TenantId, "/");
        Assert.Equal(HttpStatusCode.BadRequest,
            (await victim.GetAsync($"/api/v1/shop/auth/google/callback?code=abc&state={state}")).StatusCode);

        // En el navegador que lo empezó anda, una sola vez: la cookie se borra.
        var ok = await attacker.GetAsync($"/api/v1/shop/auth/google/callback?code=abc&state={state}");
        Assert.Equal(HttpStatusCode.Redirect, ok.StatusCode);
        Assert.Contains(ok.Headers.GetValues("Set-Cookie"), c => c.StartsWith("shop_google_nonce=;", StringComparison.Ordinal));
        Assert.Equal(HttpStatusCode.BadRequest,
            (await attacker.GetAsync($"/api/v1/shop/auth/google/callback?code=abc&state={state}")).StatusCode);
    }

    [Fact]
    public async Task Google_sobre_una_cuenta_sin_verificar_borra_la_contrasena_que_puso_otro()
    {
        var merchant = await Merchant.CreateAsync(factory, "ggp");
        var email = $"victima-{merchant.Subdomain}@gmail.com";

        // Alguien pre-registró el email de la víctima y quedó logueado. Hoy el
        // registro ya no guarda contraseña (se elige con el link del mail), pero
        // quedan cuentas de antes así: con contraseña y sin verificar.
        using (var seed = factory.Services.CreateScope())
        {
            var customers = seed.ServiceProvider.GetRequiredService<Customers.Infrastructure.CustomersDbContext>();
            var legacy = Customers.Infrastructure.Customer.CreateShopper(merchant.TenantId, "Intruso", email).Value;
            legacy.SetPasswordHash(Api.Shop.ShopAuth.HashPassword(legacy, "clave-del-intruso"));
            customers.Customers.Add(legacy);
            await customers.SaveChangesAsync();
        }
        var intruder = new Shopper(merchant);
        await intruder.ExpectOkAsync(HttpMethod.Post, "/api/v1/shop/auth/login", new { email, password = "clave-del-intruso" });

        // La víctima entra con Google (que verificó el email).
        await using var app = WithGoogle();
        var client = NoRedirects(app);
        var state = await StartAsync(client, merchant.TenantId, "/");
        factory.ExternalHttp.OnJson(HttpMethod.Post, GoogleToken, new { id_token = "id-token-ok" });
        _google.Next = new GoogleIdentity("google-sub-victima", email, "Víctima", EmailVerified: true);
        var callback = await client.GetAsync($"/api/v1/shop/auth/google/callback?code=abc&state={Uri.EscapeDataString(state)}");
        Assert.Equal(HttpStatusCode.Redirect, callback.StatusCode);

        // La contraseña del intruso ya no sirve y su sesión se cerró.
        Assert.Equal(HttpStatusCode.Unauthorized, (await intruder.SendAsync(HttpMethod.Get, "/api/v1/shop/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await intruder.SendAsync(HttpMethod.Post, "/api/v1/shop/auth/login",
            new { email, password = "clave-del-intruso" })).StatusCode);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<Customers.Infrastructure.CustomersDbContext>();
        var account = await db.Customers.IgnoreQueryFilters().SingleAsync(c => c.TenantId == merchant.TenantId && c.Email == email);
        Assert.Null(account.PasswordHash);
        Assert.True(account.EmailVerified);
        Assert.Equal("google-sub-victima", account.GoogleSubject);
    }

    [Fact]
    public async Task Una_cuenta_vinculada_a_otra_cuenta_de_Google_no_se_pisa()
    {
        var merchant = await Merchant.CreateAsync(factory, "ggs");
        var email = $"duena-{merchant.Subdomain}@empresa.example";
        await using var app = WithGoogle();
        var client = NoRedirects(app);
        factory.ExternalHttp.OnJson(HttpMethod.Post, GoogleToken, new { id_token = "id-token-ok" });

        async Task<HttpResponseMessage> EnterAsync(string sub, string mail)
        {
            var state = await StartAsync(client, merchant.TenantId, "/");
            _google.Next = new GoogleIdentity(sub, mail, "Dueña", EmailVerified: true);
            return await client.GetAsync($"/api/v1/shop/auth/google/callback?code=abc&state={Uri.EscapeDataString(state)}");
        }

        // La dueña original entra y queda vinculada.
        Assert.Equal(HttpStatusCode.Redirect, (await EnterAsync("google-sub-original", email)).StatusCode);

        // La dirección pasó a otra cuenta de Google (otro sub): no entra ni se vincula.
        var other = await EnterAsync("google-sub-nuevo-dueno", email);
        Assert.Equal(HttpStatusCode.Conflict, other.StatusCode);
        Assert.Contains("Esa cuenta ya está vinculada a otra cuenta de Google", await other.Content.ReadAsStringAsync(), StringComparison.Ordinal);
        var cookies = other.Headers.TryGetValues("Set-Cookie", out var set) ? set.ToList() : [];
        Assert.DoesNotContain(cookies, c => c.StartsWith($"shop_{merchant.TenantId:N}=", StringComparison.Ordinal));

        // La dueña original sigue entrando, aunque Google ahora le dé otro email.
        Assert.Equal(HttpStatusCode.Redirect, (await EnterAsync("google-sub-original", $"nueva-{merchant.Subdomain}@gmail.com")).StatusCode);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<Customers.Infrastructure.CustomersDbContext>();
        var account = await db.Customers.IgnoreQueryFilters().SingleAsync(c => c.TenantId == merchant.TenantId && c.Email == email);
        Assert.Equal("google-sub-original", account.GoogleSubject);
        Assert.False(await db.Customers.IgnoreQueryFilters().AnyAsync(c => c.TenantId == merchant.TenantId && c.Email == $"nueva-{merchant.Subdomain}@gmail.com"));
    }

    [Fact]
    public async Task Google_solo_para_una_tienda_que_existe_y_esta_abierta()
    {
        var merchant = await Merchant.CreateAsync(factory, "ggt");
        await using var app = WithGoogle();
        var client = NoRedirects(app);

        // Un GUID que no es de ninguna tienda.
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.GetAsync($"/api/v1/shop/auth/google/start?tenant={Guid.NewGuid()}&return=/")).StatusCode);

        // La tienda se suspende entre el arranque y la vuelta: no se da de alta a nadie.
        var state = await StartAsync(client, merchant.TenantId, "/");
        using (var scope = factory.Services.CreateScope())
        {
            var tenancy = scope.ServiceProvider.GetRequiredService<Tenancy.Infrastructure.Persistence.TenancyDbContext>();
            (await tenancy.Tenants.IgnoreQueryFilters().SingleAsync(t => t.Id == merchant.TenantId)).Suspend();
            await tenancy.SaveChangesAsync();
        }
        factory.ExternalHttp.OnJson(HttpMethod.Post, GoogleToken, new { id_token = "id-token-ok" });
        var email = $"susp-{merchant.Subdomain}@gmail.com";
        _google.Next = new GoogleIdentity("google-sub-susp", email, "Ana", EmailVerified: true);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.GetAsync($"/api/v1/shop/auth/google/callback?code=abc&state={Uri.EscapeDataString(state)}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.GetAsync($"/api/v1/shop/auth/google/start?tenant={merchant.TenantId}&return=/")).StatusCode);

        using var check = factory.Services.CreateScope();
        var db = check.ServiceProvider.GetRequiredService<Customers.Infrastructure.CustomersDbContext>();
        Assert.False(await db.Customers.IgnoreQueryFilters().AnyAsync(c => c.Email == email));
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
