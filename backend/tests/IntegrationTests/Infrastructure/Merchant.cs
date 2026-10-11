using System.Net;
using System.Text.Json;
using Identity.Infrastructure;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing.Handlers;
using Microsoft.Extensions.DependencyInjection;

namespace IntegrationTests;

/// <summary>
/// Un comerciante logueado con su tienda: el punto de partida de casi todo
/// test de integración.
///
/// <para>
/// Lo que hace es lo mismo que hace el panel: el usuario se crea por dentro
/// —no hay registro público; en producción lo da de alta un dueño desde
/// Usuarios—, entra por la API con su contraseña (cookie de sesión, como el
/// admin real) y crea su tienda, de la que queda dueño. Cada pedido viaja con
/// el header X-Tenant-Id, como lo manda el panel.
/// </para>
///
/// <para>
/// Antes cada archivo de tests tenía su copia de esto —crear usuario,
/// loguearse, crear tienda, GET y POST con el header—, con pequeñas
/// diferencias entre copias. Una sola implementación hace que un cambio en el
/// alta (o en cómo se autentica el panel) se arregle en un lugar.
/// </para>
/// </summary>
public sealed class Merchant
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private const string Password = "password-larga-123";

    private Merchant(ApiFactory factory, HttpClient client, Guid tenantId, string subdomain, string email)
    {
        Factory = factory;
        Client = client;
        TenantId = tenantId;
        Subdomain = subdomain;
        Email = email;
    }

    public ApiFactory Factory { get; }

    /// <summary>Cliente con la cookie de sesión del comerciante.</summary>
    public HttpClient Client { get; }

    public Guid TenantId { get; }
    public string Subdomain { get; }
    public string Email { get; }

    /// <summary>Un comerciante nuevo, con su tienda recién creada.</summary>
    public static async Task<Merchant> CreateAsync(ApiFactory factory, string tag = "m")
    {
        var unique = Unique(tag);
        var client = factory.CreateDefaultClient(new CookieContainerHandler());
        var email = await LogInNewUserAsync(factory, client, unique);
        return await OpenStoreAsync(factory, client, unique, email);
    }

    /// <summary>
    /// Otra tienda de la MISMA persona, con la misma sesión. Loguear a otro
    /// usuario en este cliente cambiaría de quién es la cookie.
    /// </summary>
    public Task<Merchant> OpenAnotherStoreAsync(string tag = "m2") =>
        OpenStoreAsync(Factory, Client, Unique(tag), Email);

    private static string Unique(string tag) => $"{tag}{Guid.NewGuid():N}"[..12].ToLowerInvariant();

    private static async Task<Merchant> OpenStoreAsync(ApiFactory factory, HttpClient client, string subdomain, string email)
    {
        var create = await client.PostAsJsonAsync("/api/v1/tenants", new { name = $"Tienda {subdomain}", subdomain });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var tenant = await create.Content.ReadFromJsonAsync<JsonElement>(Json);
        return new Merchant(factory, client, tenant.GetProperty("id").GetGuid(), subdomain, email);
    }

    /// <summary>
    /// Un usuario creado por dentro y logueado por la API, sin tienda propia
    /// todavía. Devuelve su email.
    /// </summary>
    public static async Task<string> LogInNewUserAsync(ApiFactory factory, HttpClient client, string tag)
    {
        var email = $"it-{tag}@test.local";
        using (var scope = factory.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
            if (await users.FindByEmailAsync(email) is null)
            {
                var user = new AppUser { UserName = email, Email = email, DisplayName = $"Test {tag}", EmailConfirmed = true };
                var created = await users.CreateAsync(user, Password);
                Assert.True(created.Succeeded, string.Join(", ", created.Errors.Select(e => e.Description)));
            }
        }

        var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { email, password = Password });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        return email;
    }

    /// <summary>Cliente SIN sesión pero apuntando a esta tienda: un comprador o un anónimo.</summary>
    public HttpClient Anonymous() => Factory.CreateClient();

    // ---------------------------------------------------------------- pedidos

    /// <summary>Un pedido con el header de la tienda. No valida la respuesta: para probar errores.</summary>
    public Task<HttpResponseMessage> SendAsync(HttpMethod method, string path, object? body = null) =>
        SendAsync(Client, method, path, body);

    /// <summary>Lo mismo con otro cliente (anónimo, de otro comerciante) pero esta tienda.</summary>
    public Task<HttpResponseMessage> SendAsync(HttpClient client, HttpMethod method, string path, object? body = null)
    {
        var req = new HttpRequestMessage(method, path);
        req.Headers.Add("X-Tenant-Id", TenantId.ToString());
        if (body is not null) req.Content = JsonContent.Create(body, options: Json);
        return client.SendAsync(req);
    }

    public Task<JsonElement> GetAsync(string path) => ExpectJsonAsync(HttpMethod.Get, path, null);
    public Task<JsonElement> PostAsync(string path, object body) => ExpectJsonAsync(HttpMethod.Post, path, body);
    public Task<JsonElement> PutAsync(string path, object body) => ExpectJsonAsync(HttpMethod.Put, path, body);
    public Task<JsonElement> PatchAsync(string path, object body) => ExpectJsonAsync(HttpMethod.Patch, path, body);

    /// <summary>Un pedido que tiene que salir bien (2xx); si no, el test falla con el cuerpo de la respuesta.</summary>
    public async Task<HttpResponseMessage> ExpectOkAsync(HttpMethod method, string path, object? body = null)
    {
        var res = await SendAsync(method, path, body);
        Assert.True(res.IsSuccessStatusCode, $"{method} {path} → {(int)res.StatusCode}: {await res.Content.ReadAsStringAsync()}");
        return res;
    }

    private async Task<JsonElement> ExpectJsonAsync(HttpMethod method, string path, object? body)
    {
        var res = await ExpectOkAsync(method, path, body);
        if (res.StatusCode == HttpStatusCode.NoContent) return default;
        return await res.Content.ReadFromJsonAsync<JsonElement>(Json);
    }

    // ---------------------------------------------------------------- datos

    /// <summary>
    /// Un producto publicado de una variante, con stock cargado. Devuelve el id
    /// del producto y el de su variante. Sin stock, el carrito, el checkout y
    /// los presupuestos fallan por "sin stock", que no es lo que se prueba.
    /// </summary>
    public async Task<(Guid ProductId, Guid VariantId)> CreateProductAsync(
        string name, long priceMinor = 100_000, int stock = 100, string? sku = null)
    {
        var body = await PostAsync("/api/v1/products", new
        {
            name,
            description = "producto de test",
            publish = true,
            variants = new[]
            {
                new { sku = sku ?? $"SKU-{Guid.NewGuid():N}"[..20], optionValues = Array.Empty<string>(), priceAmount = priceMinor, currency = "ARS" },
            },
        });

        var productId = body.GetProperty("id").GetGuid();
        var product = await GetAsync($"/api/v1/products/{productId}");
        var variantId = product.GetProperty("variants").EnumerateArray().First().GetProperty("id").GetGuid();

        if (stock > 0)
            await ExpectOkAsync(HttpMethod.Put, $"/api/v1/inventory/{variantId}", new { available = stock, reason = "carga inicial de test" });

        return (productId, variantId);
    }

    /// <summary>
    /// Una venta de mostrador pagada en efectivo, con un producto propio: la
    /// orden sobre la que se despacha, se factura o se devuelve.
    /// </summary>
    public async Task<Guid> CreateSaleAsync(long priceMinor = 50_000_00, int quantity = 1, string buyerEmail = "comprador@test.local")
    {
        var (_, variantId) = await CreateProductAsync($"Producto {Guid.NewGuid():N}"[..20], priceMinor);
        var order = await PostAsync("/api/v1/orders/manual", new
        {
            items = new[] { new { variantId, quantity } },
            paymentMethod = "cash",
            buyerEmail,
            buyerName = "Comprador de Test",
        });
        return order.GetProperty("id").GetGuid();
    }

    /// <summary>El stock disponible de una variante, como lo ve el panel.</summary>
    public async Task<int> AvailableAsync(Guid variantId)
    {
        var body = await GetAsync($"/api/v1/inventory?variantIds={variantId}");
        return body.GetProperty("items").EnumerateArray().Single().GetProperty("available").GetInt32();
    }
}
