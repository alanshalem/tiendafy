using System.Net;
using Identity.Infrastructure;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Mvc.Testing.Handlers;
using Microsoft.Extensions.DependencyInjection;

namespace IntegrationTests;

/// <summary>
/// Los links con token que salen por mail (verificar, restablecer, activar,
/// la bienvenida de alguien del equipo) se arman con la URL del panel
/// (<c>Admin:BaseUrl</c>) o la de la tienda, nunca con el <c>Origin</c> del
/// pedido: quien pide el mail de otro no elige adónde va su token.
/// </summary>
[Collection("api")]
public sealed class AccountMailLinksTests(ApiFactory factory)
{
    private const string AdminBase = "https://admin.ejemplo.test";

    [Fact]
    public async Task Los_links_del_panel_van_a_Admin_BaseUrl_venga_de_donde_venga_el_pedido()
    {
        await using var app = factory.WithWebHostBuilder(b => b.UseSetting("Admin:BaseUrl", AdminBase));
        var client = app.CreateDefaultClient(new CookieContainerHandler());
        var email = $"links-{Guid.NewGuid():N}@test.local";
        using (var scope = app.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
            Assert.True((await users.CreateAsync(new AppUser { UserName = email, Email = email, DisplayName = "Links" }, "Clave-larga-123")).Succeeded);
        }

        // Con el Origin de otro puerto de localhost (en desarrollo cuenta como
        // panel, así que pasa el filtro de /auth) y sin Origin.
        var forgot = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/forgot") { Content = JsonContent.Create(new { email }) };
        forgot.Headers.Add("Origin", "http://localhost:5199");
        Assert.Equal(HttpStatusCode.NoContent, (await client.SendAsync(forgot)).StatusCode);
        var reset = await factory.ExternalHttp.WaitForEmailAsync(email, m => m.Html.Contains("/restablecer?", StringComparison.Ordinal));
        Assert.Contains($"href=\"{AdminBase}/restablecer?email=", reset.Html, StringComparison.Ordinal);
        Assert.DoesNotContain("localhost:5199", reset.Html, StringComparison.Ordinal);

        Assert.Equal(HttpStatusCode.NoContent,
            (await client.PostAsJsonAsync("/api/v1/auth/resend-verification", new { email })).StatusCode);
        var verify = await factory.ExternalHttp.WaitForEmailAsync(email, m => m.Html.Contains("/verificar?", StringComparison.Ordinal));
        Assert.Contains($"href=\"{AdminBase}/verificar?email=", verify.Html, StringComparison.Ordinal);
    }

    [Fact]
    public async Task La_bienvenida_de_alguien_del_equipo_va_al_panel_y_no_al_Origin()
    {
        var store = await Merchant.CreateAsync(factory, "lnkm");
        var email = $"nuevo-{Guid.NewGuid():N}@test.local";
        var add = new HttpRequestMessage(HttpMethod.Post, "/api/v1/members") { Content = JsonContent.Create(new { email, role = "vendedor" }) };
        add.Headers.Add("X-Tenant-Id", store.TenantId.ToString());
        add.Headers.Add("Origin", "http://localhost:5199");
        Assert.True((await store.Client.SendAsync(add)).IsSuccessStatusCode);

        // Sin Admin:BaseUrl en desarrollo: el panel de dev.
        var welcome = Assert.Single(factory.ExternalHttp.EmailsTo(email));
        Assert.Contains("href=\"http://localhost:5173/restablecer?email=", welcome.Html, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Los_links_de_la_cuenta_del_comprador_van_a_su_tienda_aunque_el_pedido_venga_de_otra()
    {
        var store = await Merchant.CreateAsync(factory, "lnka");
        var other = await Merchant.CreateAsync(factory, "lnkb");
        var storeBase = $"http://{store.Subdomain}.localhost:3000";

        // Registro con el Origin de otra tienda: el link de activación va a la suya.
        var email = $"ana-{Guid.NewGuid():N}@test.local";
        Assert.Equal(HttpStatusCode.Accepted,
            (await SendAsync(store, "/api/v1/shop/auth/register", new { name = "Ana", email }, $"http://{other.Subdomain}.localhost:3000")).StatusCode);
        var activation = Assert.Single(factory.ExternalHttp.EmailsTo(email));
        Assert.Contains($"{storeBase}/cuenta/verificar?token=", activation.Html, StringComparison.Ordinal);
        Assert.DoesNotContain(other.Subdomain, activation.Html, StringComparison.Ordinal);

        // Activa su cuenta; "olvidé mi contraseña" desde el host de las fotos y
        // "ya tenés cuenta" sin Origin: los dos, a su tienda.
        await new Shopper(store).ExpectOkAsync(HttpMethod.Post, "/api/v1/shop/auth/verify",
            new { token = Shopper.TokenFrom(activation.Html), password = "una-clave-larga" });
        Assert.Equal(HttpStatusCode.NoContent,
            (await SendAsync(store, "/api/v1/shop/auth/forgot", new { email }, "http://localhost:9000")).StatusCode);
        var reset = await factory.ExternalHttp.WaitForEmailAsync(email, m => m.Html.Contains("/cuenta/reset?token=", StringComparison.Ordinal));
        Assert.Contains($"{storeBase}/cuenta/reset?token=", reset.Html, StringComparison.Ordinal);

        Assert.Equal(HttpStatusCode.Accepted,
            (await SendAsync(store, "/api/v1/shop/auth/register", new { name = "Ana", email }, origin: null)).StatusCode);
        var attempt = Assert.Single(factory.ExternalHttp.EmailsTo(email), m => m.Subject.StartsWith("Ya tenés una cuenta", StringComparison.Ordinal));
        Assert.Contains($"{storeBase}/cuenta", attempt.Html, StringComparison.Ordinal);
    }

    [Fact]
    public async Task La_tienda_principal_usa_el_dominio_pelado()
    {
        var store = await Merchant.CreateAsync(factory, "lnkp");
        await using var app = factory.WithWebHostBuilder(b => b.UseSetting("Tenancy:PrimaryStoreSubdomain", store.Subdomain));
        var email = $"pri-{Guid.NewGuid():N}@test.local";
        var req = new HttpRequestMessage(HttpMethod.Post, "/api/v1/shop/auth/register") { Content = JsonContent.Create(new { name = "Ana", email }) };
        req.Headers.Add("X-Tenant-Id", store.TenantId.ToString());
        Assert.Equal(HttpStatusCode.Accepted, (await app.CreateClient().SendAsync(req)).StatusCode);
        Assert.Contains("http://localhost:3000/cuenta/verificar?token=", Assert.Single(factory.ExternalHttp.EmailsTo(email)).Html, StringComparison.Ordinal);
    }

    private static Task<HttpResponseMessage> SendAsync(Merchant store, string path, object body, string? origin)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, path) { Content = JsonContent.Create(body) };
        req.Headers.Add("X-Tenant-Id", store.TenantId.ToString());
        if (origin is not null) req.Headers.Add("Origin", origin);
        return store.Anonymous().SendAsync(req);
    }
}
