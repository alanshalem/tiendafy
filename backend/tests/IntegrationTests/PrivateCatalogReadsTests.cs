using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Identity.Infrastructure;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing.Handlers;
using Microsoft.Extensions.DependencyInjection;

namespace IntegrationTests;

/// <summary>
/// Las lecturas privadas de un grupo de GET públicos.
///
/// Los GET de /products son públicos —los usa la tienda—, pero algunos no
/// pueden serlo: los costos son dato interno del comercio, y el escáner, los
/// kits y la salud del catálogo son del panel. Ese permiso estaba escrito como
/// primera línea de cada handler; ahora se declara en la ruta. Este test es lo
/// que garantiza que la mudanza no dejó ninguno abierto.
/// </summary>
[Collection("api")]
public sealed class PrivateCatalogReadsTests
{
    private readonly ApiFactory _factory;

    public PrivateCatalogReadsTests(ApiFactory factory) => _factory = factory;

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private static readonly string[] Privadas =
    [
        "/api/v1/products/health",
        "/api/v1/products/costs",
        $"/api/v1/products/{Guid.Empty}/costs",
        "/api/v1/products/kits",
        "/api/v1/products/kits/suggested-costs",
        "/api/v1/products/by-code/7790000000000",
    ];

    public static TheoryData<string> Rutas() => new(Privadas);

    [Theory]
    [MemberData(nameof(Rutas))]
    public async Task Sin_sesion_no_se_lee(string path)
    {
        var owner = _factory.CreateDefaultClient(new CookieContainerHandler());
        var tenantId = await RegisterWithStoreAsync(owner, $"prv{Guid.NewGuid():N}"[..12]);

        var anonimo = _factory.CreateClient();
        var res = await SendAsync(anonimo, tenantId, path);

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Theory]
    [MemberData(nameof(Rutas))]
    public async Task El_duenio_si_las_lee(string path)
    {
        var owner = _factory.CreateDefaultClient(new CookieContainerHandler());
        var tenantId = await RegisterWithStoreAsync(owner, $"own{Guid.NewGuid():N}"[..12]);

        var res = await SendAsync(owner, tenantId, path);

        // 404 es válido para las que buscan algo puntual (un id o un código
        // que no existe): lo que no puede ser es 401 ni 403.
        Assert.True(res.StatusCode is HttpStatusCode.OK or HttpStatusCode.NotFound,
            $"GET {path} → {(int)res.StatusCode}: {await res.Content.ReadAsStringAsync()}");
    }

    [Fact]
    public async Task Los_GET_publicos_del_catalogo_siguen_publicos()
    {
        // El otro lado: la tienda lista productos sin sesión. Si declarar
        // permisos en la ruta se hubiera filtrado al grupo, esto daría 401.
        var owner = _factory.CreateDefaultClient(new CookieContainerHandler());
        var tenantId = await RegisterWithStoreAsync(owner, $"pub{Guid.NewGuid():N}"[..12]);

        var res = await SendAsync(_factory.CreateClient(), tenantId, "/api/v1/products?status=ACTIVE&limit=5");

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
    }

    private static Task<HttpResponseMessage> SendAsync(HttpClient client, Guid tenantId, string path)
    {
        var req = new HttpRequestMessage(HttpMethod.Get, path);
        req.Headers.Add("X-Tenant-Id", tenantId.ToString());
        return client.SendAsync(req);
    }

    /// <summary>Igual que en los demás tests: el usuario se crea por dentro y entra por la API.</summary>
    private async Task<Guid> RegisterWithStoreAsync(HttpClient client, string tag)
    {
        var email = $"it-{tag}@test.local";
        const string password = "password-larga-123";

        using (var scope = _factory.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
            if (await users.FindByEmailAsync(email) is null)
            {
                var user = new AppUser { UserName = email, Email = email, DisplayName = $"Test {tag}", EmailConfirmed = true };
                var created = await users.CreateAsync(user, password);
                Assert.True(created.Succeeded, string.Join(", ", created.Errors.Select(e => e.Description)));
            }
        }

        var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { email, password });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);

        var create = await client.PostAsJsonAsync("/api/v1/tenants", new { name = $"Tienda {tag}", subdomain = tag });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var tenant = await create.Content.ReadFromJsonAsync<JsonElement>(Json);
        return tenant.GetProperty("id").GetGuid();
    }
}
