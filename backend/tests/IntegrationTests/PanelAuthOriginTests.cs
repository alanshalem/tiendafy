using System.Net;
using System.Text.Json;
using Identity.Infrastructure;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Mvc.Testing.Handlers;
using Microsoft.Extensions.DependencyInjection;

namespace IntegrationTests;

/// <summary>
/// Entrar, salir, el segundo paso y configurarlo son pedidos anónimos (o con
/// la cookie intermedia): la regla de la sesión del panel (OriginRules) no los
/// cubría. Desde otra origen —un script en una tienda— responden 403; desde el
/// panel o sin Origin, como siempre.
/// </summary>
[Collection("api")]
public sealed class PanelAuthOriginTests(ApiFactory factory)
{
    private const string PanelOrigin = "http://localhost:5173";
    private const string Password = "Clave-larga-123";

    [Fact]
    public async Task Login_desde_una_tienda_responde_403_y_no_abre_sesion()
    {
        var store = await Merchant.CreateAsync(factory, "lgo");
        var email = await CreateUserAsync(factory, "lgo");
        var client = factory.CreateDefaultClient(new CookieContainerHandler());

        var foreign = await PostAsync(client, "/api/v1/auth/login", new { email, password = Password }, StoreOrigin(store));
        Assert.Equal(HttpStatusCode.Forbidden, foreign.StatusCode);
        Assert.Equal("Auth.ForeignOrigin", await TitleAsync(foreign));
        Assert.False(foreign.Headers.Contains("Set-Cookie"));
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/auth/me")).StatusCode);

        // Desde otro sitio, igual.
        Assert.Equal(HttpStatusCode.Forbidden,
            (await PostAsync(client, "/api/v1/auth/login", new { email, password = Password }, "https://sitio-malicioso.example")).StatusCode);

        // Desde el panel (y sin Origin) entra.
        Assert.Equal(HttpStatusCode.OK, (await PostAsync(client, "/api/v1/auth/login", new { email, password = Password }, PanelOrigin)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await PostAsync(factory.CreateDefaultClient(new CookieContainerHandler()),
            "/api/v1/auth/login", new { email, password = Password }, origin: null)).StatusCode);
    }

    [Fact]
    public async Task Logout_desde_una_tienda_no_cierra_la_sesion_del_panel()
    {
        var store = await Merchant.CreateAsync(factory, "lgt");

        var foreign = await PostAsync(store.Client, "/api/v1/auth/logout", body: null, StoreOrigin(store));
        Assert.Equal(HttpStatusCode.Forbidden, foreign.StatusCode);
        Assert.False(foreign.Headers.Contains("Set-Cookie"));
        Assert.Equal(HttpStatusCode.OK, (await store.Client.GetAsync("/api/v1/auth/me")).StatusCode);

        // Desde el panel sí sale.
        Assert.Equal(HttpStatusCode.NoContent, (await PostAsync(store.Client, "/api/v1/auth/logout", body: null, PanelOrigin)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await store.Client.GetAsync("/api/v1/auth/me")).StatusCode);
    }

    [Theory]
    [InlineData("/api/v1/auth/login/2fa")]
    [InlineData("/api/v1/auth/2fa/setup")]
    [InlineData("/api/v1/auth/2fa/enable")]
    [InlineData("/api/v1/auth/forgot")]
    [InlineData("/api/v1/auth/reset")]
    public async Task El_resto_de_las_escrituras_de_auth_tampoco_se_aceptan_desde_una_tienda(string path)
    {
        var store = await Merchant.CreateAsync(factory, "lgw");
        var res = await PostAsync(store.Client, path, new { code = "123456", email = store.Email, token = "x", password = Password }, StoreOrigin(store));
        Assert.Equal(HttpStatusCode.Forbidden, res.StatusCode);
        Assert.Equal("Auth.ForeignOrigin", await TitleAsync(res));
    }

    [Fact]
    public async Task La_configuracion_obligatoria_del_segundo_paso_solo_se_completa_desde_el_panel()
    {
        await using var app = factory.WithWebHostBuilder(b => b.UseSetting("Auth:RequireTwoFactorForAdmins", "true"));
        var store = await Merchant.CreateAsync(factory, "lgs");
        var email = await CreateUserAsync(app, "lgs");
        using (var scope = app.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
            var user = await users.FindByEmailAsync(email);
            Assert.Equal(MembershipChange.Done,
                await scope.ServiceProvider.GetRequiredService<IMembershipService>().AddAsync(user!.Id, store.TenantId, Roles.Owner));
        }

        var client = app.CreateDefaultClient(new CookieContainerHandler());
        var login = await PostAsync(client, "/api/v1/auth/login", new { email, password = Password }, PanelOrigin);
        Assert.True((await login.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("twoFactorSetupRequired").GetBoolean());

        // Con la cookie intermedia, desde la tienda: ni empezar ni confirmar.
        Assert.Equal(HttpStatusCode.Forbidden, (await PostAsync(client, "/api/v1/auth/2fa/setup", new { }, StoreOrigin(store))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await PostAsync(client, "/api/v1/auth/2fa/enable", new { code = "123456", password = Password }, StoreOrigin(store))).StatusCode);

        // Desde el panel, sigue andando.
        var setup = await PostAsync(client, "/api/v1/auth/2fa/setup", new { }, PanelOrigin);
        Assert.Equal(HttpStatusCode.OK, setup.StatusCode);
        var key = (await setup.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("sharedKey").GetString()!;
        Assert.Equal(HttpStatusCode.OK,
            (await PostAsync(client, "/api/v1/auth/2fa/enable", new { code = TotpCodes.At(key, 0), password = Password }, PanelOrigin)).StatusCode);
    }

    private static string StoreOrigin(Merchant store) => $"http://{store.Subdomain}.localhost:3000";

    private static Task<HttpResponseMessage> PostAsync(HttpClient client, string path, object? body, string? origin)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, path) { Content = body is null ? null : JsonContent.Create(body) };
        if (origin is not null) req.Headers.Add("Origin", origin);
        return client.SendAsync(req);
    }

    private static async Task<string> CreateUserAsync(WebApplicationFactory<Program> app, string tag)
    {
        var email = $"{tag}-{Guid.NewGuid():N}@test.local";
        using var scope = app.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
        var created = await users.CreateAsync(new AppUser { UserName = email, Email = email, DisplayName = "Test", EmailConfirmed = true }, Password);
        Assert.True(created.Succeeded, string.Join(", ", created.Errors.Select(e => e.Description)));
        return email;
    }

    private static async Task<string?> TitleAsync(HttpResponseMessage res) =>
        (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("title").GetString();
}
