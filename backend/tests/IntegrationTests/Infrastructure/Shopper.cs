using System.Text.Json;

namespace IntegrationTests;

/// <summary>
/// Un comprador de la tienda: sin sesión, con el header de la tienda, como el
/// storefront. Arma el carrito, completa el checkout y queda listo para pagar.
/// </summary>
public sealed class Shopper(Merchant store)
{
    private readonly HttpClient _client = store.Anonymous();

    /// <summary>La URL de vuelta que manda el storefront: un subdominio propio.</summary>
    public string ReturnUrl => $"http://{store.Subdomain}.localhost:3000";

    /// <summary>
    /// Como el storefront: header de la tienda y Origin propio (las escrituras
    /// del chat exigen mismo origen). La sesión, si hay, viaja en la cookie.
    /// </summary>
    public Task<HttpResponseMessage> SendAsync(HttpMethod method, string path, object? body = null) =>
        SendAsync(method, path, body is null ? null : JsonContent.Create(body, options: Merchant.Json));

    public Task<HttpResponseMessage> SendAsync(HttpMethod method, string path, HttpContent? content)
    {
        var req = new HttpRequestMessage(method, path) { Content = content };
        req.Headers.Add("X-Tenant-Id", store.TenantId.ToString());
        req.Headers.Add("Origin", ReturnUrl);
        return _client.SendAsync(req);
    }

    /// <summary>Un pedido que tiene que salir bien (2xx), sin leer el cuerpo.</summary>
    public async Task<HttpResponseMessage> ExpectOkAsync(HttpMethod method, string path, object? body = null)
    {
        var res = await SendAsync(method, path, body);
        Assert.True(res.IsSuccessStatusCode, $"{method} {path} → {(int)res.StatusCode}: {await res.Content.ReadAsStringAsync()}");
        return res;
    }

    public async Task<JsonElement> ExpectJsonAsync(HttpMethod method, string path, object? body = null)
    {
        var res = await SendAsync(method, path, body);
        Assert.True(res.IsSuccessStatusCode, $"{method} {path} → {(int)res.StatusCode}: {await res.Content.ReadAsStringAsync()}");
        return await res.Content.ReadFromJsonAsync<JsonElement>(Merchant.Json);
    }

    /// <summary>
    /// Carrito con esa variante, checkout completo con retiro en el local (sin
    /// costo de envío) y stock reservado. Devuelve el id de la sesión.
    /// </summary>
    public async Task<Guid> CheckoutAsync(Guid variantId, int quantity = 1, Guid? shippingMethodId = null,
        string? quoteToken = null, string? address = null, string email = "comprador@test.local",
        bool acceptsWhatsApp = false)
    {
        var session = await ExpectJsonAsync(HttpMethod.Post, "/api/v1/checkout",
            new { lines = new[] { new { variantId, quantity } } });
        var id = session.GetProperty("id").GetGuid();

        await ExpectJsonAsync(HttpMethod.Post, $"/api/v1/checkout/{id}/submit", new
        {
            email,
            name = "Ana",
            lastName = "Pérez",
            phone = "1155556666",
            docNumber = "30111222",
            shippingMethodId,
            address,
            shippingQuoteToken = quoteToken,
            acceptsWhatsApp,
        });
        return id;
    }

    /// <summary>
    /// Lo que manda el checkout apenas el comprador escribe su email (y después,
    /// al completar el resto), antes de tocar "Pagar". Devuelve la compra.
    /// </summary>
    public async Task<Guid> SaveContactAsync(Guid variantId, string email, Guid? checkoutId = null,
        int quantity = 1, string? phone = null, bool acceptsWhatsApp = false)
    {
        var session = await ExpectJsonAsync(HttpMethod.Post, "/api/v1/checkout/contact", new
        {
            checkoutId,
            lines = new[] { new { variantId, quantity } },
            email,
            name = "Ana",
            phone,
            acceptsWhatsApp,
        });
        return session.GetProperty("id").GetGuid();
    }
}
