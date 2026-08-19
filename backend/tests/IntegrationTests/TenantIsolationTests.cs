using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Identity.Infrastructure;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Mvc.Testing.Handlers;
using Microsoft.Extensions.DependencyInjection;

namespace IntegrationTests;

/// <summary>
/// Aislamiento multi-tenant de punta a punta, contra la API real y Postgres:
/// dos merchants con su tienda y su producto cada uno; NADA de la tienda A
/// debe verse desde la tienda B por ningún camino (listado, by-id, sesión
/// cruzada). Es el riesgo #1 de un SaaS multi-tenant — este test es la red.
/// Requiere Postgres local (el de infra/docker/docker-compose.dev.yml o el
/// service de CI); usa una base propia (tiendafy_itests) que migra al boot.
/// </summary>
public sealed class ApiFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder)
    {
        builder.UseSetting("ConnectionStrings:Default",
            Environment.GetEnvironmentVariable("TIENDAFY_TEST_DB")
            ?? "Host=localhost;Port=5432;Database=tiendafy_itests;Username=tiendafy;Password=tiendafy");
        builder.UseSetting("Database:MigrateOnStartup", "true");
        builder.UseSetting("Media:EnsureBucketOnStartup", "false"); // sin MinIO en tests
        builder.UseSetting("Workers:Enabled", "false");             // sin background workers
    }
}

/// <summary>
/// UNA sola API para todos los tests de integración: dos hosts en paralelo
/// migran y seedean la misma DB a la vez → deadlock de Postgres en el boot.
/// </summary>
[CollectionDefinition("api")]
public sealed class ApiCollection : ICollectionFixture<ApiFactory>;

[Collection("api")]
public sealed class TenantIsolationTests
{
    private readonly ApiFactory _factory;

    public TenantIsolationTests(ApiFactory factory) => _factory = factory;

    private HttpClient NewClient() =>
        _factory.CreateDefaultClient(new CookieContainerHandler()); // sesión por cookie, como el admin real

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    /// <summary>
    /// Da de alta un merchant (queda logueado por cookie) y le crea una tienda.
    /// El usuario se crea por dentro, como lo hace el alta desde Usuarios: el
    /// panel NO tiene registro público, así que pedirlo por HTTP daría 403.
    /// </summary>
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

        var create = await client.PostAsJsonAsync("/api/v1/tenants",
            new { name = $"Tienda {tag}", subdomain = tag });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var tenant = await create.Content.ReadFromJsonAsync<JsonElement>(Json);
        return tenant.GetProperty("id").GetGuid();
    }

    private static async Task<Guid> CreateProductAsync(HttpClient client, Guid tenantId, string name)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, "/api/v1/products")
        {
            Content = JsonContent.Create(new
            {
                name,
                description = "producto de test",
                publish = true,
                variants = new[]
                {
                    new { sku = $"SKU-{Guid.NewGuid():N}", optionValues = Array.Empty<string>(), priceAmount = 100_000L, currency = "ARS" },
                },
            }),
        };
        req.Headers.Add("X-Tenant-Id", tenantId.ToString());
        var res = await client.SendAsync(req);
        Assert.True(res.IsSuccessStatusCode, $"crear producto falló: {res.StatusCode}");
        var body = await res.Content.ReadFromJsonAsync<JsonElement>(Json);
        return body.GetProperty("id").GetGuid();
    }

    private static async Task<JsonElement> GetJsonAsync(HttpClient client, string path, Guid tenantId)
    {
        var req = new HttpRequestMessage(HttpMethod.Get, path);
        req.Headers.Add("X-Tenant-Id", tenantId.ToString());
        var res = await client.SendAsync(req);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        return await res.Content.ReadFromJsonAsync<JsonElement>(Json);
    }

    [Fact]
    public async Task Los_datos_de_una_tienda_no_se_ven_desde_otra()
    {
        // Sufijo único por corrida: la DB de tests persiste entre corridas.
        var run = Guid.NewGuid().ToString("N")[..8];

        var clientA = NewClient();
        var clientB = NewClient();
        var tenantA = await RegisterWithStoreAsync(clientA, $"iso-a-{run}");
        var tenantB = await RegisterWithStoreAsync(clientB, $"iso-b-{run}");

        var productA = await CreateProductAsync(clientA, tenantA, $"Producto A {run}");
        var productB = await CreateProductAsync(clientB, tenantB, $"Producto B {run}");

        // 1) El listado de cada tienda contiene SOLO lo suyo.
        var listA = await GetJsonAsync(clientA, "/api/v1/products?limit=100", tenantA);
        var namesA = listA.GetProperty("items").EnumerateArray().Select(p => p.GetProperty("name").GetString()).ToList();
        Assert.Contains($"Producto A {run}", namesA);
        Assert.DoesNotContain($"Producto B {run}", namesA);

        var listB = await GetJsonAsync(clientB, "/api/v1/products?limit=100", tenantB);
        var namesB = listB.GetProperty("items").EnumerateArray().Select(p => p.GetProperty("name").GetString()).ToList();
        Assert.Contains($"Producto B {run}", namesB);
        Assert.DoesNotContain($"Producto A {run}", namesB);

        // 2) Pedir un producto de A con el tenant B → 404 (ni siquiera "forbidden": no existe para B).
        var crossReq = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/products/{productA}");
        crossReq.Headers.Add("X-Tenant-Id", tenantB.ToString());
        var cross = await clientB.SendAsync(crossReq);
        Assert.Equal(HttpStatusCode.NotFound, cross.StatusCode);

        // 3) Sesión de A + tenant de B en un endpoint de admin → denegado (membresía).
        var adminCross = new HttpRequestMessage(HttpMethod.Get, "/api/v1/stats/overview");
        adminCross.Headers.Add("X-Tenant-Id", tenantB.ToString());
        var denied = await clientA.SendAsync(adminCross);
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);

        // 4) Escritura cruzada: A intenta editar el producto de B → denegado, y B sigue intacto.
        var writeCross = new HttpRequestMessage(HttpMethod.Put, $"/api/v1/products/{productB}")
        {
            Content = JsonContent.Create(new { name = "HACKED", description = "x" }),
        };
        writeCross.Headers.Add("X-Tenant-Id", tenantB.ToString());
        var writeDenied = await clientA.SendAsync(writeCross);
        Assert.True(
            writeDenied.StatusCode is HttpStatusCode.Forbidden or HttpStatusCode.NotFound or HttpStatusCode.Unauthorized,
            $"la escritura cruzada devolvió {writeDenied.StatusCode}");

        var stillB = await GetJsonAsync(clientB, $"/api/v1/products/{productB}", tenantB);
        Assert.Equal($"Producto B {run}", stillB.GetProperty("name").GetString());
    }
}
