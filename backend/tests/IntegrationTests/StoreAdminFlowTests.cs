using System.Net;
using System.Text.Json;

namespace IntegrationTests;

/// <summary>
/// Lo que el comercio configura de su tienda y la tienda usa: páginas de
/// contenido, redirecciones de URLs viejas, píxeles de medición, cupones
/// (validados y aplicados en un checkout de verdad), la agenda de clientes y
/// las listas de precios mayoristas.
/// </summary>
[Collection("api")]
public sealed class StoreAdminFlowTests
{
    private readonly ApiFactory _factory;

    public StoreAdminFlowTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Paginas_redirecciones_y_medicion()
    {
        var merchant = await Merchant.CreateAsync(_factory, "cnt");
        var shopper = new Shopper(merchant);

        // Páginas: borrador, publicada, slug automático y editado.
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/pages", new { title = "", published = true })).StatusCode);
        var draft = await merchant.PostAsync("/api/v1/pages", new { title = "Cómo comprar", body = "<p>Fácil</p><script>alert(1)</script>", published = false });
        var draftId = draft.GetProperty("id").GetGuid();
        Assert.Equal("como-comprar", draft.GetProperty("slug").GetString());
        Assert.DoesNotContain("<script>", draft.GetProperty("body").GetString()); // HTML saneado
        Assert.Equal(HttpStatusCode.NotFound, (await shopper.SendAsync(HttpMethod.Get, "/api/v1/pages/by-slug/como-comprar")).StatusCode);

        await merchant.PutAsync($"/api/v1/pages/{draftId}", new { title = "Cómo comprar", slug = "como-comprar", body = "<p>Fácil</p>", published = true });
        Assert.Equal("Cómo comprar", (await shopper.ExpectJsonAsync(HttpMethod.Get, "/api/v1/pages/by-slug/como-comprar")).GetProperty("title").GetString());
        Assert.Single((await shopper.ExpectJsonAsync(HttpMethod.Get, "/api/v1/pages/published")).GetProperty("items").EnumerateArray());
        Assert.Equal(HttpStatusCode.Conflict, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/pages",
            new { title = "Otra", slug = "como-comprar", published = false })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await shopper.SendAsync(HttpMethod.Post, "/api/v1/pages", new { title = "Spam" })).StatusCode);

        await merchant.ExpectOkAsync(HttpMethod.Delete, $"/api/v1/pages/{draftId}");
        Assert.Equal(HttpStatusCode.NotFound, (await merchant.SendAsync(HttpMethod.Put, $"/api/v1/pages/{draftId}", new { title = "x" })).StatusCode);

        // Redirecciones: la URL vieja de la tienda anterior lleva a la nueva.
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/redirects", new { from = "", to = "/x" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/redirects", new { from = "/a", to = "/a" })).StatusCode);
        var redirect = await merchant.PostAsync("/api/v1/redirects", new { from = "https://vieja.com/productos/Remera-Azul?ref=1", to = "/productos/remera" });
        Assert.Equal(HttpStatusCode.Conflict, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/redirects", new { from = "/productos/remera-azul", to = "/otro" })).StatusCode);

        var resolved = await shopper.ExpectJsonAsync(HttpMethod.Get, "/api/v1/redirects/resolve?path=/productos/remera-azul");
        Assert.Equal("/productos/remera", resolved.GetProperty("to").GetString());
        Assert.Equal(HttpStatusCode.NotFound, (await shopper.SendAsync(HttpMethod.Get, "/api/v1/redirects/resolve?path=/no-existe")).StatusCode);
        Assert.Equal(1, (await merchant.GetAsync("/api/v1/redirects")).GetProperty("items")[0].GetProperty("hits").GetInt32());
        await merchant.ExpectOkAsync(HttpMethod.Delete, $"/api/v1/redirects/{redirect.GetProperty("id").GetGuid()}");
        await merchant.ExpectOkAsync(HttpMethod.Delete, $"/api/v1/redirects/{redirect.GetProperty("id").GetGuid()}");

        // Medición: ids validados; apagada, la tienda no ve nada.
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Put, "/api/v1/admin/tracking", new
        {
            enabled = true,
            requireConsent = true,
            ga4Id = "<script>",
            googleAdsId = (string?)null,
            metaPixelId = (string?)null,
            clarityId = (string?)null,
        })).StatusCode);
        await merchant.PutAsync("/api/v1/admin/tracking", new
        {
            enabled = true,
            requireConsent = false,
            ga4Id = "G-ABC123XYZ",
            googleAdsId = "AW-123456789",
            metaPixelId = "1234567890123456",
            clarityId = "abcd1234ef",
        });
        var visible = await shopper.ExpectJsonAsync(HttpMethod.Get, "/api/v1/tracking");
        Assert.Equal("G-ABC123XYZ", visible.GetProperty("ga4Id").GetString());
        Assert.False(visible.GetProperty("requireConsent").GetBoolean());
        await merchant.PutAsync("/api/v1/admin/tracking", new
        {
            enabled = false,
            requireConsent = true,
            ga4Id = "G-ABC123XYZ",
            googleAdsId = (string?)null,
            metaPixelId = (string?)null,
            clarityId = (string?)null,
        });
        Assert.Equal(JsonValueKind.Null, (await shopper.ExpectJsonAsync(HttpMethod.Get, "/api/v1/tracking")).GetProperty("ga4Id").ValueKind);
        Assert.Equal("G-ABC123XYZ", (await merchant.GetAsync("/api/v1/admin/tracking")).GetProperty("ga4Id").GetString());
    }

    [Fact]
    public async Task Cupones_validados_y_aplicados_en_un_checkout()
    {
        var merchant = await Merchant.CreateAsync(_factory, "cup");
        var shopper = new Shopper(merchant);

        // Alta, validaciones y edición.
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/coupons", new
        {
            code = "",
            type = "percentage",
            value = 10,
            minPurchase = 0,
            active = true,
        })).StatusCode);
        var coupon = await merchant.PostAsync("/api/v1/coupons", new
        {
            code = "verano10",
            type = "percent",
            value = 10,
            minPurchase = 50_000_00L,
            startsAtUtc = DateTime.UtcNow.AddDays(-1),
            endsAtUtc = DateTime.UtcNow.AddDays(30),
            maxUses = 100,
            active = true,
        });
        var couponId = coupon.GetProperty("id").GetGuid();
        Assert.Equal("VERANO10", coupon.GetProperty("code").GetString());
        Assert.Equal(HttpStatusCode.Conflict, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/coupons", new
        {
            code = "VERANO10",
            type = "fixed",
            value = 1000,
            minPurchase = 0,
            active = true,
        })).StatusCode);
        await merchant.PutAsync($"/api/v1/coupons/{couponId}", new
        {
            code = "VERANO10",
            type = "percentage",
            value = 15,
            minPurchase = 50_000_00L,
            maxUses = 100,
            active = true,
        });
        await merchant.PostAsync("/api/v1/coupons", new { code = "ENVIOGRATIS", type = "free_shipping", value = 0, minPurchase = 0, active = true });

        // Validar desde la tienda: por debajo del mínimo, inexistente, válido.
        var below = await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/coupons/validate", new { code = "verano10", subtotal = 10_000_00L });
        Assert.False(below.GetProperty("valid").GetBoolean());
        Assert.False((await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/coupons/validate", new { code = "NOEXISTE", subtotal = 1L })).GetProperty("valid").GetBoolean());
        var ok = await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/coupons/validate", new { code = "verano10", subtotal = 100_000_00L });
        Assert.Equal(15_000_00, ok.GetProperty("discountAmount").GetInt64());
        Assert.True((await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/coupons/validate", new { code = "enviogratis", subtotal = 1L })).GetProperty("freeShipping").GetBoolean());

        // Aplicado en un checkout real, cobrado con Payway (simulado): la orden
        // sale con el descuento sobre los productos y el envío intacto.
        var (_, variantId) = await merchant.CreateProductAsync("Campera", priceMinor: 100_000_00);
        var shipping = await merchant.PostAsync("/api/v1/admin/shipping/methods", new { name = "Moto", kind = "delivery", price = 3000m });
        await merchant.PutAsync("/api/v1/payments/payway/connection", new { siteId = "1", environment = "SANDBOX", publicKey = "pub", privateKey = "priv" });
        _factory.ExternalHttp.On(HttpMethod.Post, $"{Payments.Core.Domain.PaywayConnection.SandboxBaseUrl}/payments", (_, body) =>
            FakeHttp.Json(new { id = Random.Shared.Next(), status = "approved", amount = JsonDocument.Parse(body!).RootElement.GetProperty("amount").GetInt64() }, HttpStatusCode.Created));
        var checkoutId = await shopper.CheckoutAsync(variantId, shippingMethodId: shipping.GetProperty("id").GetGuid(), address: "Corrientes 1234, CABA");
        var paid = await shopper.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/checkout/{checkoutId}/pay-payway",
            new { token = "tok", bin = "450799", installments = 1, isDebit = false, couponCode = "VERANO10" });
        var order = await merchant.GetAsync($"/api/v1/orders/{paid.GetProperty("orderId").GetGuid()}");
        Assert.Equal("VERANO10", order.GetProperty("couponCode").GetString());
        Assert.Equal(100_000_00 - 15_000_00 + 3_000_00, order.GetProperty("total").GetProperty("amount").GetInt64());
        // El uso cuenta cuando la venta se cobra.
        Assert.Equal(1, (await merchant.GetAsync("/api/v1/coupons")).GetProperty("items").EnumerateArray()
            .Single(c => c.GetProperty("code").GetString() == "VERANO10").GetProperty("usedCount").GetInt32());

        // Pausar, listar, borrar.
        Assert.False((await merchant.PostAsync($"/api/v1/coupons/{couponId}/toggle", new { })).GetProperty("active").GetBoolean());
        Assert.False((await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/coupons/validate", new { code = "verano10", subtotal = 100_000_00L })).GetProperty("valid").GetBoolean());
        Assert.Equal(2, (await merchant.GetAsync("/api/v1/coupons")).GetProperty("total").GetInt32());
        await merchant.ExpectOkAsync(HttpMethod.Delete, $"/api/v1/coupons/{couponId}");
        var missing = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.NotFound, (await merchant.SendAsync(HttpMethod.Put, $"/api/v1/coupons/{missing}", new { code = "X", type = "fixed", value = 1, minPurchase = 0, active = true })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await merchant.SendAsync(HttpMethod.Post, $"/api/v1/coupons/{missing}/toggle")).StatusCode);
    }

    [Fact]
    public async Task Clientes_y_listas_de_precios()
    {
        var merchant = await Merchant.CreateAsync(_factory, "lp");
        var (_, variantId) = await merchant.CreateProductAsync("Mancuerna 5kg", priceMinor: 10_000_00, sku: $"MAN-{merchant.Subdomain}");

        // Listas: mayorista −20 %, y distribuidor sobre mayorista −10 % con redondeo.
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/price-lists", new { name = "", currency = "ARS" })).StatusCode);
        var wholesale = await merchant.PostAsync("/api/v1/price-lists", new { name = "Mayorista", currency = "ARS", adjustmentPercent = -20, rounding = "none", notes = "Gimnasios" });
        var wholesaleId = wholesale.GetProperty("id").GetGuid();
        var distributor = await merchant.PostAsync("/api/v1/price-lists", new
        {
            name = "Distribuidor",
            currency = "ARS",
            basedOnPriceListId = wholesaleId,
            adjustmentPercent = -10,
            rounding = "100",
            sortOrder = 2,
        });
        var distributorId = distributor.GetProperty("id").GetGuid();

        // La base no puede cerrar un círculo.
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Patch, $"/api/v1/price-lists/{wholesaleId}",
            new { name = "Mayorista", currency = "ARS", basedOnPriceListId = distributorId, adjustmentPercent = -20, rounding = "none" })).StatusCode);

        var prices = await merchant.GetAsync($"/api/v1/price-lists/{distributorId}/prices?q=MAN-{merchant.Subdomain}");
        var row = prices.GetProperty("items").EnumerateArray().Single(i => i.GetProperty("variantId").GetGuid() == variantId);
        Assert.Equal(7_200_00, row.GetProperty("priceMinor").GetInt64()); // 10.000 × 0,8 × 0,9
        Assert.False(row.GetProperty("isManual").GetBoolean());

        // Un precio a mano gana sobre la regla; sacarlo vuelve a la regla.
        await merchant.ExpectOkAsync(HttpMethod.Put, $"/api/v1/price-lists/{distributorId}/prices/{variantId}", new { priceMinor = 6_999_00L });
        await merchant.ExpectOkAsync(HttpMethod.Put, $"/api/v1/price-lists/{distributorId}/prices/{variantId}", new { priceMinor = 6_500_00L });
        row = (await merchant.GetAsync($"/api/v1/price-lists/{distributorId}/prices")).GetProperty("items").EnumerateArray().Single(i => i.GetProperty("variantId").GetGuid() == variantId);
        Assert.True(row.GetProperty("isManual").GetBoolean());
        Assert.Equal(6_500_00, row.GetProperty("priceMinor").GetInt64());
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Put, $"/api/v1/price-lists/{distributorId}/prices/{variantId}", new { priceMinor = -1L })).StatusCode);
        await merchant.ExpectOkAsync(HttpMethod.Put, $"/api/v1/price-lists/{distributorId}/prices/{variantId}", new { priceMinor = (long?)null });

        // Clientes con su lista, y la cotización la aplica.
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/customers", new { name = "" })).StatusCode);
        var gym = await merchant.PostAsync("/api/v1/customers", new { name = "Gimnasio Norte", email = "compras@gym.test", phone = "1144445555", address = "Cabildo 100", notes = "Paga a 30 días", priceListId = distributorId });
        var gymId = gym.GetProperty("id").GetGuid();
        await merchant.PutAsync($"/api/v1/customers/{gymId}", new { name = "Gimnasio Norte SRL", email = "compras@gym.test", phone = "1144445555", priceListId = distributorId });
        var quote = await merchant.GetAsync($"/api/v1/quotes/prices?customerId={gymId}&variantIds={variantId}");
        Assert.Equal(7_200_00, quote.GetProperty("items")[0].GetProperty("priceMinor").GetInt64());
        Assert.Single((await merchant.GetAsync("/api/v1/customers?q=norte")).GetProperty("items").EnumerateArray());

        // Una venta deja su ficha; el histórico se trae con sync.
        await merchant.CreateSaleAsync(buyerEmail: $"comprador-{merchant.Subdomain}@mail.com");
        var sync = await merchant.PostAsync("/api/v1/customers/sync-from-orders", new { });
        Assert.True(sync.GetProperty("scanned").GetInt32() >= 1);

        // Una lista sobre la que se calcula otra no se borra; sin dependientes, sí.
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Delete, $"/api/v1/price-lists/{wholesaleId}")).StatusCode);
        await merchant.ExpectOkAsync(HttpMethod.Delete, $"/api/v1/customers/{gymId}");
        await merchant.ExpectOkAsync(HttpMethod.Delete, $"/api/v1/price-lists/{distributorId}");
        await merchant.ExpectOkAsync(HttpMethod.Delete, $"/api/v1/price-lists/{wholesaleId}");
        Assert.Equal(HttpStatusCode.NotFound, (await merchant.SendAsync(HttpMethod.Get, $"/api/v1/price-lists/{distributorId}/prices")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await merchant.SendAsync(HttpMethod.Put, $"/api/v1/customers/{gymId}", new { name = "x" })).StatusCode);
    }
}
