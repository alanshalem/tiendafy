using System.Net;
using System.Text.RegularExpressions;
using Api.Notifications;

namespace IntegrationTests;

/// <summary>
/// "Avisame cuando ingrese": la suscripción en lo agotado, el aviso UNA vez
/// cuando vuelve el stock (por cualquier camino: acá, el ajuste a mano), la
/// baja desde el email, la demanda en el panel y el aislamiento entre tiendas.
/// </summary>
[Collection("api")]
public sealed partial class StockAlertFlowTests(ApiFactory factory)
{
    [Fact]
    public async Task Avisa_una_vez_cuando_vuelve_el_stock()
    {
        var merchant = await Merchant.CreateAsync(factory, "stk");
        var (productId, variantId) = await merchant.CreateProductAsync($"Campera {merchant.Subdomain}", stock: 0);
        var (_, inStock) = await merchant.CreateProductAsync($"Gorro {merchant.Subdomain}", stock: 4);
        var ana = $"ana-{merchant.Subdomain}@mail.com";
        var beto = $"beto-{merchant.Subdomain}@mail.com";
        var shopper = new Shopper(merchant);

        await shopper.ExpectOkAsync(HttpMethod.Post, "/api/v1/back-in-stock", new { variantId, email = ana.ToUpperInvariant() });
        await shopper.ExpectOkAsync(HttpMethod.Post, "/api/v1/back-in-stock", new { variantId, email = ana }); // dos veces: una
        await shopper.ExpectOkAsync(HttpMethod.Post, "/api/v1/back-in-stock", new { variantId, email = beto });
        Assert.Equal(HttpStatusCode.BadRequest, (await shopper.SendAsync(HttpMethod.Post, "/api/v1/back-in-stock", new { variantId, email = "no-es-un-email" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await shopper.SendAsync(HttpMethod.Post, "/api/v1/back-in-stock", new { variantId = inStock, email = ana })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await shopper.SendAsync(HttpMethod.Post, "/api/v1/back-in-stock", new { variantId = Guid.NewGuid(), email = ana })).StatusCode);

        // La demanda en el panel: dos personas esperando la campera.
        var demand = await merchant.GetAsync("/api/v1/admin/back-in-stock");
        var row = Assert.Single(demand.GetProperty("items").EnumerateArray());
        Assert.Equal(variantId, row.GetProperty("variantId").GetGuid());
        Assert.Equal(2, row.GetProperty("waiting").GetInt32());
        Assert.Equal(2, (await merchant.GetAsync($"/api/v1/admin/back-in-stock/products/{productId}")).GetProperty("waiting").GetInt32());

        // Sin stock todavía: nadie recibe nada.
        await Workers.RunOnceAsync<BackInStockWorker>(factory);
        Assert.Empty(Alerts(ana));

        // Entra mercadería (0 → 3): uno a cada uno, y la demanda queda en cero.
        await merchant.ExpectOkAsync(HttpMethod.Put, $"/api/v1/inventory/{variantId}", new { available = 3, reason = "llegó" });
        await Workers.RunOnceAsync<BackInStockWorker>(factory);
        var mail = Assert.Single(Alerts(ana));
        Assert.Contains($"Campera {merchant.Subdomain}", mail.Html);
        Assert.Contains("/api/v1/back-in-stock/unsubscribe?token=", mail.Html);
        Assert.Contains("ARS 1.000", mail.Html); // el precio como en el resto de los mails
        Assert.Single(Alerts(beto));
        Assert.Empty((await merchant.GetAsync("/api/v1/admin/back-in-stock")).GetProperty("items").EnumerateArray());
        Assert.Equal(2, (await merchant.GetAsync($"/api/v1/admin/back-in-stock/products/{productId}")).GetProperty("notified").GetInt32());

        // Se agota y vuelve: la suscripción ya cumplió, no se repite.
        await merchant.ExpectOkAsync(HttpMethod.Put, $"/api/v1/inventory/{variantId}", new { available = 0, reason = "vendido" });
        await merchant.ExpectOkAsync(HttpMethod.Put, $"/api/v1/inventory/{variantId}", new { available = 5, reason = "llegó más" });
        await Workers.RunOnceAsync<BackInStockWorker>(factory);
        Assert.Single(Alerts(ana));

        // La baja desde el email cancela lo que esté esperando: Ana se anota en
        // otra cosa agotada, se da de baja, y cuando entra no le llega.
        var (_, other) = await merchant.CreateProductAsync($"Buzo {merchant.Subdomain}", stock: 0);
        await shopper.ExpectOkAsync(HttpMethod.Post, "/api/v1/back-in-stock", new { variantId = other, email = ana });
        var unsubscribe = WebUtility.HtmlDecode(UnsubscribeLink().Match(mail.Html).Groups[1].Value);
        var anonymous = factory.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await anonymous.GetAsync(unsubscribe)).StatusCode); // la página de confirmación
        Assert.Equal(HttpStatusCode.OK, (await anonymous.PostAsync(unsubscribe, null)).StatusCode);
        Assert.Contains("no es válido", await (await anonymous.PostAsync("/api/v1/back-in-stock/unsubscribe?token=inventado", null)).Content.ReadAsStringAsync());
        await merchant.ExpectOkAsync(HttpMethod.Put, $"/api/v1/inventory/{other}", new { available = 2, reason = "llegó" });
        await Workers.RunOnceAsync<BackInStockWorker>(factory);
        Assert.Single(Alerts(ana));
    }

    [Fact]
    public async Task La_demanda_de_una_tienda_no_se_ve_desde_otra()
    {
        var a = await Merchant.CreateAsync(factory, "stka");
        var b = await Merchant.CreateAsync(factory, "stkb");
        var (productA, variantA) = await a.CreateProductAsync($"Mochila {a.Subdomain}", stock: 0);
        await new Shopper(a).ExpectOkAsync(HttpMethod.Post, "/api/v1/back-in-stock", new { variantId = variantA, email = $"x-{a.Subdomain}@mail.com" });

        // La variante de A no existe para B.
        Assert.Equal(HttpStatusCode.NotFound, (await new Shopper(b).SendAsync(HttpMethod.Post, "/api/v1/back-in-stock",
            new { variantId = variantA, email = $"x-{b.Subdomain}@mail.com" })).StatusCode);
        Assert.Empty((await b.GetAsync("/api/v1/admin/back-in-stock")).GetProperty("items").EnumerateArray());
        Assert.Equal(0, (await b.GetAsync($"/api/v1/admin/back-in-stock/products/{productA}")).GetProperty("waiting").GetInt32());
        Assert.Single((await a.GetAsync("/api/v1/admin/back-in-stock")).GetProperty("items").EnumerateArray());

        // Ver la demanda pide "Ver el stock": soporte no lo tiene.
        var soporte = await a.AddTeammateAsync("soporte", "sop");
        Assert.Equal(HttpStatusCode.Forbidden, await soporte.StatusAsync(HttpMethod.Get, "/api/v1/admin/back-in-stock"));
    }

    private List<FakeHttp.Email> Alerts(string to) =>
        [.. factory.ExternalHttp.EmailsTo(to).Where(m => m.Subject.StartsWith("Ya ingresó", StringComparison.Ordinal))];

    [GeneratedRegex("href='[^']*?(/api/v1/back-in-stock/unsubscribe\\?token=[^']+)'")]
    private static partial Regex UnsubscribeLink();
}
