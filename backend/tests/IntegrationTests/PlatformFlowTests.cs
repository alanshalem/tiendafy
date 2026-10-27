using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;
using Identity.Infrastructure;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing.Handlers;
using Microsoft.Extensions.DependencyInjection;

namespace IntegrationTests;

/// <summary>
/// El panel como plataforma: entrar (con email verificado), recuperar la
/// contraseña, armar el equipo con roles sin que nadie se suba de rango, y
/// administrar las tiendas (alta, chequeos, edición, archivar, borrar,
/// resolver por host).
///
/// <para>
/// Los links de verificación y de reseteo se siguen desde el mail que salió:
/// el invitado al equipo entra con la contraseña que eligió desde ese link,
/// y desde ahí se prueba lo que su rol NO le deja hacer.
/// </para>
/// </summary>
[Collection("api")]
public sealed partial class PlatformFlowTests
{
    private readonly ApiFactory _factory;

    public PlatformFlowTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Login_verificacion_y_reseteo_del_panel()
    {
        var client = NewClient();

        // Ya hay usuarios: el registro abierto está cerrado.
        Assert.False((await client.GetFromJsonAsync<JsonElement>("/api/v1/auth/registration-open")).GetProperty("open").GetBoolean());
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/v1/auth/register",
            new { name = "Intruso", email = "intruso@mail.com", password = "una-clave-larga" })).StatusCode);

        // Un usuario sin verificar no entra, aunque la contraseña sea buena.
        var email = $"sinverificar-{Guid.NewGuid():N}@test.local";
        await CreateUserAsync(email, "Clave-larga-123", confirmed: false);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/v1/auth/login", new { email, password = "otra" })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/v1/auth/login", new { email = "nadie@test.local", password = "x" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/v1/auth/login", new { email, password = "Clave-larga-123" })).StatusCode);

        // Reenvía el link, lo sigue, y entra. El email sale fuera del request.
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync("/api/v1/auth/resend-verification", new { email })).StatusCode);
        var verify = TokenFrom((await NextEmailAsync(email, already: 0)).Html);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/v1/auth/verify", new { email, token = "trucho" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/v1/auth/verify", new { email = "nadie@test.local", token = verify })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync("/api/v1/auth/verify", new { email, token = verify })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync("/api/v1/auth/verify", new { email, token = verify })).StatusCode); // idempotente
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/v1/auth/login", new { email, password = "Clave-larga-123" })).StatusCode);
        Assert.Equal(email, (await client.GetFromJsonAsync<JsonElement>("/api/v1/auth/me")).GetProperty("email").GetString());

        // Salir.
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsync("/api/v1/auth/logout", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/auth/me")).StatusCode);

        // Olvidó la contraseña: misma respuesta exista o no; el link sirve una vez.
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync("/api/v1/auth/forgot", new { email = "nadie@test.local" })).StatusCode);
        var origin = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/forgot") { Content = JsonContent.Create(new { email }) };
        origin.Headers.Add("Origin", "http://localhost:5173");
        Assert.Equal(HttpStatusCode.NoContent, (await client.SendAsync(origin)).StatusCode);
        var resetMail = await NextEmailAsync(email, already: 1);
        Assert.Contains("http://localhost:5173/restablecer", resetMail.Html); // link al panel
        var reset = TokenFrom(resetMail.Html);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/v1/auth/reset", new { email, token = "trucho", password = "Nueva-clave-456" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/v1/auth/reset", new { email = "nadie@test.local", token = reset, password = "Nueva-clave-456" })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync("/api/v1/auth/reset", new { email, token = reset, password = "Nueva-clave-456" })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/v1/auth/login", new { email, password = "Nueva-clave-456" })).StatusCode);
    }

    [Fact]
    public async Task Equipo_con_roles_y_jerarquia()
    {
        var owner = await Merchant.CreateAsync(_factory, "eq");
        var me = await owner.GetAsync("/api/v1/me/permissions");
        Assert.Equal("owner", me.GetProperty("role").GetString());
        var roles = await owner.GetAsync("/api/v1/members/roles");
        Assert.Equal(6, roles.GetProperty("roles").GetArrayLength());

        // Validaciones del alta.
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.SendAsync(HttpMethod.Post, "/api/v1/members", new { email = "x@test.local", role = "" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.SendAsync(HttpMethod.Post, "/api/v1/members", new { email = "x@test.local", role = "emperador" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.SendAsync(HttpMethod.Post, "/api/v1/members", new { email = "sin-arroba", role = "vendedor" })).StatusCode);

        // Alta de alguien sin cuenta: se le crea y le llega el mail para poner su clave.
        var sellerEmail = $"vendedora-{owner.Subdomain}@test.local";
        var added = await owner.PostAsync("/api/v1/members", new { email = sellerEmail, role = "vendedor", name = "Vendedora" });
        Assert.True(added.GetProperty("accountCreated").GetBoolean());
        var welcome = _factory.ExternalHttp.EmailsTo(sellerEmail).Last();
        var members = await owner.GetAsync("/api/v1/members");
        Assert.Equal(2, members.GetProperty("total").GetInt32());
        var sellerId = members.GetProperty("items").EnumerateArray()
            .Single(m => m.GetProperty("email").GetString() == sellerEmail).GetProperty("userId").GetGuid();

        // La vendedora pone su contraseña con el link y entra.
        var seller = NewClient();
        Assert.Equal(HttpStatusCode.NoContent, (await seller.PostAsJsonAsync("/api/v1/auth/reset",
            new { email = sellerEmail, token = TokenFrom(welcome.Html), password = "Clave-vendedora-1" })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await seller.PostAsJsonAsync("/api/v1/auth/login", new { email = sellerEmail, password = "Clave-vendedora-1" })).StatusCode);

        Assert.Equal(sellerEmail, (await seller.GetFromJsonAsync<JsonElement>("/api/v1/auth/me")).GetProperty("email").GetString());

        // Lo que su rol le deja y lo que no.
        var sellerPerms = await SendAsync(seller, owner.TenantId, HttpMethod.Get, "/api/v1/me/permissions");
        Assert.Equal("vendedor", (await sellerPerms.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("role").GetString());
        Assert.Equal(HttpStatusCode.OK, (await SendAsync(seller, owner.TenantId, HttpMethod.Get, "/api/v1/orders")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await SendAsync(seller, owner.TenantId, HttpMethod.Post, "/api/v1/members", new { email = "otro@test.local", role = "admin" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await SendAsync(seller, owner.TenantId, HttpMethod.Patch, $"/api/v1/tenants/{owner.TenantId}",
            new { name = "Hackeada", subdomain = owner.Subdomain })).StatusCode);

        // Cambiar el rol y sacar.
        await owner.ExpectOkAsync(HttpMethod.Patch, $"/api/v1/members/{sellerId}", new { role = "catalogo" });
        Assert.Equal("catalogo", (await (await SendAsync(seller, owner.TenantId, HttpMethod.Get, "/api/v1/me/permissions"))
            .Content.ReadFromJsonAsync<JsonElement>()).GetProperty("role").GetString());

        // Un admin no nombra dueños ni toca a otro admin; el dueño sí.
        var adminEmail = $"admin-{owner.Subdomain}@test.local";
        await owner.ExpectOkAsync(HttpMethod.Post, "/api/v1/members", new { email = adminEmail, role = "admin" });
        var admin = NewClient();
        await admin.PostAsJsonAsync("/api/v1/auth/reset",
            new { email = adminEmail, token = TokenFrom(_factory.ExternalHttp.EmailsTo(adminEmail).Last().Html), password = "Clave-admin-123" });
        await admin.PostAsJsonAsync("/api/v1/auth/login", new { email = adminEmail, password = "Clave-admin-123" });
        Assert.Equal(HttpStatusCode.Forbidden, (await SendAsync(admin, owner.TenantId, HttpMethod.Patch, $"/api/v1/members/{sellerId}", new { role = "owner" })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await SendAsync(admin, owner.TenantId, HttpMethod.Patch, $"/api/v1/members/{sellerId}", new { role = "soporte" })).StatusCode);

        // El último dueño no se puede degradar ni sacar.
        var ownerId = (await owner.GetAsync("/api/v1/members")).GetProperty("items").EnumerateArray()
            .Single(m => m.GetProperty("role").GetString() == "owner").GetProperty("userId").GetGuid();
        Assert.Equal(HttpStatusCode.Conflict, (await owner.SendAsync(HttpMethod.Patch, $"/api/v1/members/{ownerId}", new { role = "admin" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await owner.SendAsync(HttpMethod.Delete, $"/api/v1/members/{ownerId}")).StatusCode);

        await owner.ExpectOkAsync(HttpMethod.Delete, $"/api/v1/members/{sellerId}");
        Assert.Equal(HttpStatusCode.Forbidden, (await SendAsync(seller, owner.TenantId, HttpMethod.Get, "/api/v1/orders")).StatusCode);
    }

    [Fact]
    public async Task Tiendas_alta_chequeos_edicion_y_baja()
    {
        var merchant = await Merchant.CreateAsync(_factory, "tnd");

        // Chequeo de disponibilidad para el formulario.
        var check = await merchant.GetAsync($"/api/v1/tenants/check?subdomain={merchant.Subdomain}&name=Tienda%20{merchant.Subdomain}");
        Assert.False(check.GetProperty("subdomainAvailable").GetBoolean());
        Assert.False(check.GetProperty("nameAvailable").GetBoolean());
        Assert.False((await merchant.GetAsync("/api/v1/tenants/check?subdomain=NO%20VALE")).GetProperty("subdomainValid").GetBoolean());
        Assert.True((await merchant.GetAsync($"/api/v1/tenants/check?subdomain={merchant.Subdomain}&excludeId={merchant.TenantId}")).GetProperty("subdomainAvailable").GetBoolean());

        // Alta inválida.
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.Client.PostAsJsonAsync("/api/v1/tenants", new { name = "X", subdomain = "NO VALE" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await merchant.Client.PostAsJsonAsync("/api/v1/tenants", new { name = "Otra", subdomain = merchant.Subdomain })).StatusCode);

        // Una segunda tienda del mismo dueño: aparece en el listado y en el resumen.
        var second = await merchant.OpenAnotherStoreAsync("tnd2");
        var list = await merchant.Client.GetFromJsonAsync<JsonElement>("/api/v1/tenants");
        Assert.Equal(2, list.GetProperty("items").GetArrayLength());
        await merchant.CreateSaleAsync();
        var overview = await merchant.GetAsync("/api/v1/tenants/overview?days=30");
        Assert.Equal(2, overview.GetProperty("items").GetArrayLength());

        // Editar: nombre, subdominio y dominio propio.
        var newSub = $"ed{Guid.NewGuid():N}"[..12];
        var edited = await merchant.PatchAsync($"/api/v1/tenants/{second.TenantId}", new
        {
            name = $"Tienda editada {newSub}",
            subdomain = newSub,
            customDomain = $"www.{newSub}.com.ar",
        });
        Assert.Equal(newSub, edited.GetProperty("subdomain").GetString());
        var domain = await second.GetAsync("/api/v1/tenants/domain-status");
        Assert.Equal($"www.{newSub}.com.ar", domain.GetProperty("customDomain").GetString());
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Patch, $"/api/v1/tenants/{second.TenantId}",
            new { name = "x", subdomain = "NO VALE", customDomain = (string?)null })).StatusCode);

        // Resolver la tienda por host: por subdominio y por dominio propio.
        var anonymous = _factory.CreateClient();
        Assert.Equal(second.TenantId, (await anonymous.GetFromJsonAsync<JsonElement>($"/api/v1/tenants/resolve?host={newSub}.localhost")).GetProperty("id").GetGuid());
        Assert.Equal(HttpStatusCode.OK, (await anonymous.GetAsync($"/api/v1/tenants/resolve?domain=www.{newSub}.com.ar")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync("/api/v1/tenants/resolve?host=no-existe.localhost")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await anonymous.GetAsync("/api/v1/tenants/resolve")).StatusCode);

        // Archivar, reactivar, borrar (lógico) y purgar (solo en desarrollo).
        Assert.Equal("SUSPENDED", (await merchant.PostAsync($"/api/v1/tenants/{second.TenantId}/archive", new { })).GetProperty("status").GetString(), ignoreCase: true);
        Assert.Equal("ACTIVE", (await merchant.PostAsync($"/api/v1/tenants/{second.TenantId}/activate", new { })).GetProperty("status").GetString(), ignoreCase: true);
        await merchant.ExpectOkAsync(HttpMethod.Delete, $"/api/v1/tenants/{second.TenantId}");
        await merchant.ExpectOkAsync(HttpMethod.Delete, $"/api/v1/tenants/{second.TenantId}/purge");
        // Purgada no queda ni la membresía: ya no es "tu" tienda.
        Assert.Equal(HttpStatusCode.Forbidden, (await merchant.Client.GetAsync($"/api/v1/tenants/{second.TenantId}")).StatusCode);

        // Una tienda ajena: ni se ve ni se toca.
        var stranger = await Merchant.CreateAsync(_factory, "ajn");
        Assert.Equal(HttpStatusCode.Forbidden, (await merchant.Client.GetAsync($"/api/v1/tenants/{stranger.TenantId}")).StatusCode);
        foreach (var (method, path) in new[]
        {
            (HttpMethod.Post, $"/api/v1/tenants/{stranger.TenantId}/archive"),
            (HttpMethod.Post, $"/api/v1/tenants/{stranger.TenantId}/activate"),
            (HttpMethod.Delete, $"/api/v1/tenants/{stranger.TenantId}"),
            (HttpMethod.Delete, $"/api/v1/tenants/{stranger.TenantId}/purge"),
        })
        {
            Assert.Equal(HttpStatusCode.Forbidden, (await merchant.Client.SendAsync(new HttpRequestMessage(method, path))).StatusCode);
        }
    }

    // ---------------------------------------------------------------- helpers

    private HttpClient NewClient() => _factory.CreateDefaultClient(new CookieContainerHandler());

    private static Task<HttpResponseMessage> SendAsync(HttpClient client, Guid tenantId, HttpMethod method, string path, object? body = null)
    {
        var req = new HttpRequestMessage(method, path);
        req.Headers.Add("X-Tenant-Id", tenantId.ToString());
        if (body is not null) req.Content = JsonContent.Create(body);
        return client.SendAsync(req);
    }

    private async Task CreateUserAsync(string email, string password, bool confirmed)
    {
        using var scope = _factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
        var created = await users.CreateAsync(new AppUser { UserName = email, Email = email, DisplayName = "Test", EmailConfirmed = confirmed }, password);
        Assert.True(created.Succeeded);
    }

    /// <summary>
    /// El email número <paramref name="already"/> + 1 a esa dirección. Los de la
    /// cuenta del panel pedidos sin sesión salen fuera del request
    /// (PanelAccountEmails): se espera a que lleguen.
    /// </summary>
    private async Task<FakeHttp.Email> NextEmailAsync(string to, int already)
    {
        for (var i = 0; i < 200; i++)
        {
            var sent = _factory.ExternalHttp.EmailsTo(to);
            if (sent.Count > already) return sent[already];
            await Task.Delay(25);
        }
        throw new TimeoutException($"No llegó el email {already + 1} a {to}.");
    }

    /// <summary>El token del link del mail (viene escapado para URL).</summary>
    private static string TokenFrom(string html) => Uri.UnescapeDataString(TokenRegex().Match(html).Groups[1].Value);

    [GeneratedRegex("token=([^&\"<\\s]+)")]
    private static partial Regex TokenRegex();
}
