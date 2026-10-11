using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Identity.Infrastructure;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing.Handlers;
using Microsoft.Extensions.DependencyInjection;

namespace IntegrationTests;

/// <summary>
/// La forma de los listados del panel, contra la API real.
///
/// Todos devuelven lo mismo —<c>items</c> y <c>total</c>— y el panel pagina con
/// eso. La mecánica de paginar se unificó en un helper, pero la respuesta de
/// cada endpoint la sigue armando él: este test es lo que garantiza que
/// unificar la mecánica no le haya cambiado el contrato a ninguno, ahora ni
/// cuando a alguien se le ocurra "emprolijar" las respuestas.
///
/// Y de paso cubre el techo de página: pedir cien mil filas no puede traerlas.
/// </summary>
[Collection("api")]
public sealed class ListContractTests
{
    private readonly ApiFactory _factory;

    public ListContractTests(ApiFactory factory) => _factory = factory;

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    /// <summary>Los listados que comparten la mecánica de paginado.</summary>
    private static readonly string[] Paths =
    [
        "/api/v1/coupons",
        "/api/v1/customers",
        "/api/v1/quotes",
        "/api/v1/contact/messages",
        "/api/v1/purchasing/purchase-orders",
        "/api/v1/finance/movements",
        "/api/v1/finance/receipts",
    ];

    public static TheoryData<string> Listados() => new(Paths);

    [Theory]
    [MemberData(nameof(Listados))]
    public async Task Un_listado_devuelve_items_y_total(string path)
    {
        var client = _factory.CreateDefaultClient(new CookieContainerHandler());
        var tenantId = await RegisterWithStoreAsync(client, $"lst{Guid.NewGuid():N}"[..12]);

        var body = await GetAsync(client, tenantId, path);

        Assert.True(body.TryGetProperty("items", out var items), $"{path} no devolvió 'items'");
        Assert.Equal(JsonValueKind.Array, items.ValueKind);
        Assert.True(body.TryGetProperty("total", out var total), $"{path} no devolvió 'total'");
        Assert.Equal(JsonValueKind.Number, total.ValueKind);
    }

    [Theory]
    [MemberData(nameof(Listados))]
    public async Task Pedir_cien_mil_filas_no_las_trae(string path)
    {
        var client = _factory.CreateDefaultClient(new CookieContainerHandler());
        var tenantId = await RegisterWithStoreAsync(client, $"cap{Guid.NewGuid():N}"[..12]);

        var sep = path.Contains('?') ? '&' : '?';
        var body = await GetAsync(client, tenantId, $"{path}{sep}limit=100000&offset=-5");

        // La tienda está vacía, así que lo que se prueba es que no explote ni
        // rechace: el clamp pasa a ser el techo real y el offset negativo es
        // el principio. (El límite en sí lo cubre PagingTests, sin base.)
        Assert.Equal(JsonValueKind.Array, body.GetProperty("items").ValueKind);
        Assert.Equal(0, body.GetProperty("total").GetInt32());
    }

    private static async Task<JsonElement> GetAsync(HttpClient client, Guid tenantId, string path)
    {
        var req = new HttpRequestMessage(HttpMethod.Get, path);
        req.Headers.Add("X-Tenant-Id", tenantId.ToString());
        var res = await client.SendAsync(req);
        Assert.True(res.IsSuccessStatusCode, $"GET {path} → {res.StatusCode}: {await res.Content.ReadAsStringAsync()}");
        return await res.Content.ReadFromJsonAsync<JsonElement>(Json);
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
                var user = new AppUser
                {
                    UserName = email,
                    Email = email,
                    DisplayName = $"Test {tag}",
                    EmailConfirmed = true,
                };
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
