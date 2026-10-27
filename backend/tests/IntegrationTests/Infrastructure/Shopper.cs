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

    public Task<HttpResponseMessage> SendAsync(HttpMethod method, string path, HttpContent? content) =>
        SendFromAsync(ReturnUrl, method, path, content);

    /// <summary>
    /// Con la sesión de este comprador (su cookie) pero desde otro origen (null
    /// = sin Origin, como la tienda armando la página en el servidor).
    /// </summary>
    public Task<HttpResponseMessage> SendFromAsync(string? origin, HttpMethod method, string path, HttpContent? content = null, Guid? tenantId = null)
    {
        var req = new HttpRequestMessage(method, path) { Content = content };
        req.Headers.Add("X-Tenant-Id", (tenantId ?? store.TenantId).ToString());
        if (origin is not null) req.Headers.Add("Origin", origin);
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
    /// Crea la cuenta y la activa con el link del mail, como la persona: el
    /// registro pide nombre y email, y la contraseña se elige en el link.
    /// Queda logueada y con el email verificado.
    /// </summary>
    public async Task<JsonElement> RegisterVerifiedAsync(string email, string name = "Ana Pérez", string password = "una-clave-larga")
    {
        var res = await SendAsync(HttpMethod.Post, "/api/v1/shop/auth/register", new { name, email });
        Assert.Equal(System.Net.HttpStatusCode.Accepted, res.StatusCode);
        var mail = store.Factory.ExternalHttp.EmailsTo(email).Last(m => m.Html.Contains("/cuenta/verificar?token=", StringComparison.Ordinal));
        return await ExpectJsonAsync(HttpMethod.Post, "/api/v1/shop/auth/verify", new { token = TokenFrom(mail.Html), password });
    }

    /// <summary>
    /// Se suscribe al newsletter y confirma con el link del mail, como la
    /// persona (doble confirmación): recién ahí le llegan las campañas.
    /// </summary>
    public async Task SubscribeConfirmedAsync(string email, string source = "footer")
    {
        await ExpectJsonAsync(HttpMethod.Post, "/api/v1/newsletter", new { email, source });
        var mail = await store.Factory.ExternalHttp.WaitForEmailAsync(email, m => m.Html.Contains("/suscripcion/confirmar?token=", StringComparison.Ordinal));
        await ExpectJsonAsync(HttpMethod.Post, "/api/v1/newsletter/confirm", new { token = TokenFrom(mail.Html) });
    }

    /// <summary>El token del link de un mail de la cuenta (verificar, reset).</summary>
    public static string TokenFrom(string html) =>
        System.Text.RegularExpressions.Regex.Match(html, @"token=([A-Za-z0-9_\-%]+)").Groups[1].Value;

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
