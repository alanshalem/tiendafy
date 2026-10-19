using System.Net;
using System.Text.Json;

namespace IntegrationTests;

/// <summary>
/// El envío se cotiza con lo que pesa lo que se compra.
///
/// Antes los tres correos cotizaban N unidades del "paquete por defecto" de la
/// tienda: tres medias y tres discos de 15 kg pagaban lo mismo. Ahora cada
/// variante tiene su peso y sus medidas (las que no, usan el default), la
/// cotización queda atada al CONTENIDO del carrito y la etiqueta de la venta
/// sale con el mismo cálculo que pagó el comprador.
/// </summary>
[Collection("api")]
public sealed class ShippingWeightTests(ApiFactory factory)
{
    private const string Correo = "https://apitest.correoargentino.com.ar/micorreo/v1";
    private const string Zipnova = "https://api.zipnova.com.ar/v2";
    private const string Andreani = Checkout.Core.Domain.AndreaniConfig.ProductionBaseUrl;

    [Fact]
    public async Task El_peso_y_las_medidas_se_cargan_por_variante()
    {
        var merchant = await Merchant.CreateAsync(factory, "pv");
        var (productId, variantId) = await merchant.CreateProductAsync("Disco 15 kg");
        var shipping = $"/api/v1/products/{productId}/variants/{variantId}/shipping";

        // Las medidas van las tres juntas; el peso, entre 1 g y 1.000 kg.
        var partial = await merchant.SendAsync(HttpMethod.Put, shipping, new { weightGrams = 15_000, lengthCm = 40 });
        Assert.Equal(HttpStatusCode.BadRequest, partial.StatusCode);
        Assert.Contains("las tres medidas", await partial.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.BadRequest,
            (await merchant.SendAsync(HttpMethod.Put, shipping, new { weightGrams = 0 })).StatusCode);

        await merchant.ExpectOkAsync(HttpMethod.Put, shipping,
            new { weightGrams = 15_000, lengthCm = 40, widthCm = 40, heightCm = 5 });
        var variant = (await merchant.GetAsync($"/api/v1/products/{productId}")).GetProperty("variants")[0];
        Assert.Equal(15_000, variant.GetProperty("weightGrams").GetInt32());
        Assert.Equal(5, variant.GetProperty("heightCm").GetInt32());

        // Todo null lo borra: vuelve a cotizar con el default del correo.
        await merchant.ExpectOkAsync(HttpMethod.Put, shipping, new { });
        variant = (await merchant.GetAsync($"/api/v1/products/{productId}")).GetProperty("variants")[0];
        Assert.Equal(JsonValueKind.Null, variant.GetProperty("weightGrams").ValueKind);

        // El alta también los acepta, con el código de barras.
        var created = await merchant.PostAsync("/api/v1/products", new
        {
            name = "Mancuerna 5 kg",
            variants = new[]
            {
                new
                {
                    sku = "MAN-5", optionValues = Array.Empty<string>(), priceAmount = 10_000_00L, currency = "ARS",
                    barcode = "7790001112223", weightGrams = 5_000, lengthCm = 30, widthCm = 12, heightCm = 12,
                },
            },
        });
        var v = created.GetProperty("variants")[0];
        Assert.Equal("7790001112223", v.GetProperty("barcode").GetString());
        Assert.Equal(5_000, v.GetProperty("weightGrams").GetInt32());
    }

    [Fact]
    public async Task Los_correos_cotizan_con_el_peso_de_lo_que_se_compra()
    {
        var merchant = await Merchant.CreateAsync(factory, "pc");
        var shopper = new Shopper(merchant);
        var (discProduct, disc) = await merchant.CreateProductAsync("Disco 15 kg", stock: 20);
        var (_, socks) = await merchant.CreateProductAsync("Medias", stock: 20); // sin peso: usa el default
        await merchant.ExpectOkAsync(HttpMethod.Put, $"/api/v1/products/{discProduct}/variants/{disc}/shipping",
            new { weightGrams = 15_000, lengthCm = 40, widthCm = 40, heightCm = 5 });
        await ConfigureCarriersAsync(merchant);
        var cart = new[] { new { variantId = disc, quantity = 1 }, new { variantId = socks, quantity = 2 } };

        // Correo Argentino: un solo bulto. El peso se suma (15 kg + 2 × 800 g),
        // las alturas se apilan y el largo y el ancho son los del más grande.
        var correo = await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/shipping/correo/quote",
            new { postalCode = "1636", units = 3, items = cart });
        var dims = JsonDocument.Parse(factory.ExternalHttp.SentTo($"{Correo}/rates").Last().Body!)
            .RootElement.GetProperty("dimensions");
        Assert.Equal(16_600, dims.GetProperty("weight").GetInt32());
        Assert.Equal(40, dims.GetProperty("length").GetInt32());
        Assert.Equal(40, dims.GetProperty("width").GetInt32());
        Assert.Equal(25, dims.GetProperty("height").GetInt32());

        // Zipnova y Andreani: un paquete por unidad, cada uno con su peso.
        await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/shipping/zipnova/quote",
            new { postalCode = "1636", city = "Olivos", state = "Buenos Aires", items = cart, declaredValue = 60_000m });
        var packages = JsonDocument.Parse(factory.ExternalHttp.SentTo($"{Zipnova}/shipments/quote").Last().Body!)
            .RootElement.GetProperty("packages").EnumerateArray().Select(p => p.GetProperty("weight").GetInt32()).ToList();
        Assert.Equal([15_000, 800, 800], packages);

        await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/shipping/andreani/quote",
            new { postalCode = "1636", items = cart });
        var andreani = Uri.UnescapeDataString(factory.ExternalHttp.SentTo($"{Andreani}/v1/tarifas").Last().Uri.Query);
        Assert.Contains("bultos[0][kilos]=15", andreani);
        Assert.Contains("bultos[2][kilos]=0.8", andreani);
        Assert.Contains("bultos[0][volumen]=8000", andreani);

        // La cotización queda atada al CONTENIDO: las mismas 3 unidades, pero
        // tres medias en vez del disco, hay que volver a cotizar.
        var token = correo.GetProperty("options").EnumerateArray()
            .First(o => o.GetProperty("kind").GetString() == "D").GetProperty("token").GetString()!;
        var swapped = await SubmitAsync(shopper, [new { variantId = socks, quantity = 3 }], token);
        Assert.Contains("carrito cambió", await swapped.Content.ReadAsStringAsync());
        var same = await SubmitAsync(shopper, cart, token);
        Assert.Equal(HttpStatusCode.OK, same.StatusCode);

        // Un storefront viejo (solo cantidad) sigue cotizando, con el default.
        await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/shipping/correo/quote", new { postalCode = "1636", units = 2 });
        dims = JsonDocument.Parse(factory.ExternalHttp.SentTo($"{Correo}/rates").Last().Body!).RootElement.GetProperty("dimensions");
        Assert.Equal(1_600, dims.GetProperty("weight").GetInt32());
    }

    [Fact]
    public async Task La_etiqueta_de_la_venta_pesa_lo_que_se_vendio()
    {
        var merchant = await Merchant.CreateAsync(factory, "pe");
        var (discProduct, disc) = await merchant.CreateProductAsync("Disco 15 kg", stock: 20);
        var (_, socks) = await merchant.CreateProductAsync("Medias", stock: 20);
        await merchant.ExpectOkAsync(HttpMethod.Put, $"/api/v1/products/{discProduct}/variants/{disc}/shipping",
            new { weightGrams = 15_000, lengthCm = 40, widthCm = 40, heightCm = 5 });
        await ConfigureCarriersAsync(merchant);
        var order = await merchant.PostAsync("/api/v1/orders/manual", new
        {
            items = new[] { new { variantId = disc, quantity = 1 }, new { variantId = socks, quantity = 2 } },
            paymentMethod = "cash",
            buyerEmail = "comprador@test.local",
            buyerName = "Comprador",
        });
        var orderId = order.GetProperty("id").GetGuid();

        factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Correo}/shipping/import", new { createdAt = "2026-10-13T12:00:00" });
        await merchant.PostAsync($"/api/v1/admin/orders/{orderId}/correo-shipment", new
        {
            deliveryType = "D",
            recipientName = "Ana",
            recipientEmail = "ana@mail.com",
            streetName = "Corrientes",
            streetNumber = "1234",
            city = "CABA",
            provinceCode = "C",
            postalCode = "1043",
        });
        var shippingBody = JsonDocument.Parse(factory.ExternalHttp.SentTo($"{Correo}/shipping/import").Last().Body!)
            .RootElement.GetProperty("shipping");
        Assert.Equal(16_600, shippingBody.GetProperty("weight").GetInt32());
        Assert.Equal(25, shippingBody.GetProperty("height").GetInt32());
    }

    // ---------------------------------------------------------------- helpers

    private static async Task<HttpResponseMessage> SubmitAsync(Shopper shopper, object[] lines, string quoteToken)
    {
        var start = await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/checkout", new { lines });
        return await shopper.SendAsync(HttpMethod.Post, $"/api/v1/checkout/{start.GetProperty("id").GetGuid()}/submit", new
        {
            email = "comprador@test.local",
            name = "Ana",
            shippingQuoteToken = quoteToken,
            address = "Maipú 100, Olivos",
            postalCode = "1636",
        });
    }

    /// <summary>Los tres correos con el mismo paquete por defecto: 800 g, 30 × 20 × 10 cm.</summary>
    private async Task ConfigureCarriersAsync(Merchant merchant)
    {
        await merchant.PutAsync("/api/v1/admin/shipping/correo", new
        {
            userToken = $"user-{merchant.Subdomain}",
            passwordToken = "p",
            customerId = "0009",
            environment = "TEST",
            originPostalCode = "1425",
            defaultWeightGrams = 800,
            defaultLengthCm = 30,
            defaultWidthCm = 20,
            defaultHeightCm = 10,
            offerHomeDelivery = true,
            offerAgencyDelivery = true,
            active = true,
        });
        factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Correo}/token", new { token = "jwt" });
        factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Correo}/rates", new
        {
            rates = new[]
            {
                new { deliveredType = "D", productType = "CP", productName = "Clásico", price = 9200m, deliveryTimeMin = "3", deliveryTimeMax = "6" },
            },
        });

        await merchant.PutAsync("/api/v1/admin/shipping/zipnova", new
        {
            apiToken = "zt",
            apiSecret = "zs",
            country = "AR",
            accountId = 1,
            originId = "auto",
            defaultWeightGrams = 800,
            defaultLengthCm = 30,
            defaultWidthCm = 20,
            defaultHeightCm = 10,
            active = true,
        });
        factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Zipnova}/shipments/quote", new
        {
            all_results = new[]
            {
                new { selectable = true, carrier = new { id = 1, name = "OCA" }, service_type = new { id = 1, code = "standard_delivery", name = "Estándar" },
                      delivery_time = new { estimated_delivery = "2026-10-20" }, amounts = new { price = 3000m, price_incl_tax = 3630m } },
            },
        });

        await merchant.PutAsync("/api/v1/admin/shipping/andreani", new
        {
            username = "u",
            password = "p",
            homeDeliveryContract = "300006611",
            useQa = false,
            senderName = "Tienda",
            senderEmail = "t@t.com",
            senderDocumentType = "CUIT",
            senderDocumentNumber = "30712345678",
            originStreet = "Calle",
            originNumber = "1",
            originCity = "CABA",
            originPostalCode = "1425",
            weightGrams = 800,
            lengthCm = 30,
            widthCm = 20,
            heightCm = 10,
            active = true,
        });
        factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Andreani}/v1/tarifas",
            new { tarifaConIva = new { total = "6000.00" }, tarifaSinIva = new { total = "4958.68" } });
    }
}
