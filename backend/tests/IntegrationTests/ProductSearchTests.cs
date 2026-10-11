using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Identity.Infrastructure;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing.Handlers;
using Microsoft.Extensions.DependencyInjection;

namespace IntegrationTests;

/// <summary>
/// Buscar productos como escribe una persona, contra Postgres real.
///
/// Antes la búsqueda era el texto entero, contiguo y sensible a tildes:
/// "camion" no encontraba "Camión" y "rojo camión" no encontraba nada. Ahora
/// cada palabra tiene que aparecer, en cualquier orden y sin importar tildes.
/// La parte que más importa es la última: es un superconjunto estricto, así
/// que nada de lo que antes se encontraba deja de encontrarse.
///
/// Corre contra la base porque las tildes las saca unaccent, de Postgres.
/// </summary>
[Collection("api")]
public sealed class ProductSearchTests
{
    private readonly ApiFactory _factory;

    public ProductSearchTests(ApiFactory factory) => _factory = factory;

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private const string Camion = "Camión de juguete Rojo";
    private const string Remera = "Remera Azul Lisa";

    [Theory]
    [InlineData("camion", Camion)]          // sin tilde encuentra con tilde
    [InlineData("CAMIÓN", Camion)]          // y con tilde y en mayúsculas
    [InlineData("rojo camion", Camion)]     // palabras en cualquier orden
    [InlineData("azul remera", Remera)]
    [InlineData("Camión de juguete", Camion)] // lo que ya andaba: el texto contiguo
    public async Task El_panel_encuentra_lo_que_escribe_una_persona(string q, string esperado)
    {
        var (client, tenantId) = await StoreWithProductsAsync();

        var nombres = await NamesAsync(client, tenantId, $"/api/v1/products?offset=0&limit=50&q={Uri.EscapeDataString(q)}");

        Assert.Contains(esperado, nombres);
    }

    [Fact]
    public async Task Todas_las_palabras_tienen_que_estar()
    {
        var (client, tenantId) = await StoreWithProductsAsync();

        var nombres = await NamesAsync(client, tenantId, "/api/v1/products?offset=0&limit=50&q=camion%20azul");

        Assert.DoesNotContain(Camion, nombres);
        Assert.DoesNotContain(Remera, nombres);
    }

    [Fact]
    public async Task El_panel_tambien_encuentra_por_SKU()
    {
        var (client, tenantId) = await StoreWithProductsAsync();

        var nombres = await NamesAsync(client, tenantId, "/api/v1/products?offset=0&limit=50&q=REM-AZ");

        Assert.Contains(Remera, nombres);
    }

    [Fact]
    public async Task La_tienda_busca_sin_tildes_y_no_por_SKU()
    {
        var (client, tenantId) = await StoreWithProductsAsync();

        var porNombre = await NamesAsync(client, tenantId, "/api/v1/products/search?q=rojo%20camion");
        var porSku = await NamesAsync(client, tenantId, "/api/v1/products/search?q=REM-AZ");

        Assert.Contains(Camion, porNombre);
        Assert.Empty(porSku);
    }

    // ---------------------------------------------------------------- helpers

    private async Task<(HttpClient Client, Guid TenantId)> StoreWithProductsAsync()
    {
        var client = _factory.CreateDefaultClient(new CookieContainerHandler());
        var tenantId = await RegisterWithStoreAsync(client, $"src{Guid.NewGuid():N}"[..12]);
        await CreateProductAsync(client, tenantId, Camion, "CAM-RJ-01");
        await CreateProductAsync(client, tenantId, Remera, "REM-AZ-01");
        return (client, tenantId);
    }

    private static async Task<List<string>> NamesAsync(HttpClient client, Guid tenantId, string path)
    {
        var req = new HttpRequestMessage(HttpMethod.Get, path);
        req.Headers.Add("X-Tenant-Id", tenantId.ToString());
        var res = await client.SendAsync(req);
        Assert.True(res.IsSuccessStatusCode, $"GET {path} → {res.StatusCode}: {await res.Content.ReadAsStringAsync()}");
        var body = await res.Content.ReadFromJsonAsync<JsonElement>(Json);
        return [.. body.GetProperty("items").EnumerateArray().Select(p => p.GetProperty("name").GetString()!)];
    }

    private static async Task CreateProductAsync(HttpClient client, Guid tenantId, string name, string sku)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, "/api/v1/products")
        {
            Content = JsonContent.Create(new
            {
                name,
                description = "producto de test",
                publish = true,
                variants = new[] { new { sku, optionValues = Array.Empty<string>(), priceAmount = 100_000L, currency = "ARS" } },
            }),
        };
        req.Headers.Add("X-Tenant-Id", tenantId.ToString());
        var res = await client.SendAsync(req);
        Assert.True(res.IsSuccessStatusCode, $"crear {name} → {res.StatusCode}: {await res.Content.ReadAsStringAsync()}");
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
