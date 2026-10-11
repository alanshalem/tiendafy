using System.Net;
using System.Text.Json;

namespace IntegrationTests;

/// <summary>
/// El checkout con envío cotizado por carrier. El precio del envío nunca lo
/// manda el navegador: viaja en un token firmado por la API al cotizar, atado
/// a la tienda y a la cantidad de unidades, y el submit lo vuelve a abrir.
/// Se prueba con los tres carriers, y cada forma de que el token no sirva.
/// </summary>
[Collection("api")]
public sealed class CheckoutShippingTests
{
    private const string Correo = "https://apitest.correoargentino.com.ar/micorreo/v1";
    private const string Zipnova = "https://api.zipnova.com.ar/v2";
    private const string Andreani = Checkout.Core.Domain.AndreaniConfig.ProductionBaseUrl;

    private readonly ApiFactory _factory;

    public CheckoutShippingTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task El_envio_cotizado_viaja_firmado_y_se_valida_al_confirmar()
    {
        var merchant = await Merchant.CreateAsync(_factory, "chk");
        var shopper = new Shopper(merchant);
        var (_, variantId) = await merchant.CreateProductAsync("Mochila", priceMinor: 40_000_00, stock: 30);
        await ConfigureCarriersAsync(merchant);

        // Cotizaciones de las tres empresas para 2 unidades.
        var correo = (await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/shipping/correo/quote", new { postalCode = "8300", units = 2 }))
            .GetProperty("options").EnumerateArray().ToList();
        var zipnova = (await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/shipping/zipnova/quote",
            new { postalCode = "8300", city = "Neuquén", state = "Neuquén", units = 2, declaredValue = 80_000m }))
            .GetProperty("options").EnumerateArray().ToList();
        var andreani = (await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/shipping/andreani/quote", new { postalCode = "8300", units = 2 }))
            .GetProperty("options").EnumerateArray().ToList();
        string Token(List<JsonElement> options, Func<JsonElement, bool> pick) => options.First(pick).GetProperty("token").GetString()!;

        // Correo a domicilio: con dirección.
        var home = await SubmitAsync(shopper, variantId, 2, Token(correo, o => o.GetProperty("kind").GetString() == "D"), address: "San Martín 100, Neuquén");
        Assert.Equal(HttpStatusCode.OK, home.StatusCode);
        var session = await home.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(5_200_00, session.GetProperty("shipping").GetProperty("amount").GetInt64());
        Assert.Contains("a domicilio", session.GetProperty("shippingMethod").GetString());

        // Correo a sucursal: sin sucursal no; con sucursal, su nombre y dirección.
        var branchToken = Token(correo, o => o.GetProperty("kind").GetString() == "S");
        Assert.Equal(HttpStatusCode.BadRequest, (await SubmitAsync(shopper, variantId, 2, branchToken)).StatusCode);
        var branch = await SubmitAsync(shopper, variantId, 2, branchToken, agency: "Q0001");
        Assert.Contains("Centro (Q0001)", (await branch.Content.ReadAsStringAsync()));

        // Zipnova a domicilio y Andreani a sucursal (sin dirección).
        Assert.Equal(HttpStatusCode.OK, (await SubmitAsync(shopper, variantId, 2, Token(zipnova, _ => true), address: "Belgrano 50")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await SubmitAsync(shopper, variantId, 2, Token(andreani, o => o.GetProperty("toBranch").GetBoolean()))).StatusCode);

        // Lo que no pasa: token trucho, carrito distinto del cotizado, sin
        // dirección cuando hace falta.
        Assert.Contains("venció", await (await SubmitAsync(shopper, variantId, 2, "token-trucho")).Content.ReadAsStringAsync());
        Assert.Contains("carrito cambió", await (await SubmitAsync(shopper, variantId, 1, Token(zipnova, _ => true), address: "x")).Content.ReadAsStringAsync());
        Assert.Contains("dirección", await (await SubmitAsync(shopper, variantId, 2, Token(andreani, o => !o.GetProperty("toBranch").GetBoolean()))).Content.ReadAsStringAsync());

        // Un token de OTRA tienda no se abre acá.
        var other = await Merchant.CreateAsync(_factory, "chko");
        var (_, otherVariant) = await other.CreateProductAsync("Otra", stock: 5);
        Assert.Equal(HttpStatusCode.BadRequest, (await SubmitAsync(new Shopper(other), otherVariant, 2, Token(zipnova, _ => true), address: "x")).StatusCode);
    }

    [Fact]
    public async Task Medios_propios_stock_y_estado_de_la_sesion()
    {
        var merchant = await Merchant.CreateAsync(_factory, "chm");
        var shopper = new Shopper(merchant);
        var (_, variantId) = await merchant.CreateProductAsync("Gorra", priceMinor: 9_000_00, stock: 3);

        // Medios propios: retiro (sin dirección) y envío (con dirección), con validaciones.
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/admin/shipping/methods", new { name = "", kind = "pickup" })).StatusCode);
        var pickup = await merchant.PostAsync("/api/v1/admin/shipping/methods", new { name = "Retiro", kind = "pickup", price = 0m, pickupAddress = "Local 1" });
        var delivery = await merchant.PostAsync("/api/v1/admin/shipping/methods", new { name = "Moto", kind = "delivery", price = 2500m, description = "En el día", sortOrder = 1 });
        var deliveryId = delivery.GetProperty("id").GetGuid();
        await merchant.PutAsync($"/api/v1/admin/shipping/methods/{deliveryId}", new { name = "Moto CABA", kind = "delivery", price = 3000m, active = true });
        Assert.Equal(HttpStatusCode.NotFound, (await merchant.SendAsync(HttpMethod.Put, $"/api/v1/admin/shipping/methods/{Guid.NewGuid()}", new { name = "x", kind = "pickup" })).StatusCode);
        Assert.Equal(2, (await shopper.ExpectJsonAsync(HttpMethod.Get, "/api/v1/shipping/methods")).GetProperty("items").GetArrayLength());

        var start = await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/checkout", new { lines = new[] { new { variantId, quantity = 1 } } });
        var id = start.GetProperty("id").GetGuid();
        Assert.Equal(id, (await shopper.ExpectJsonAsync(HttpMethod.Get, $"/api/v1/checkout/{id}")).GetProperty("id").GetGuid());
        Assert.Equal(HttpStatusCode.NotFound, (await shopper.SendAsync(HttpMethod.Get, $"/api/v1/checkout/{Guid.NewGuid()}")).StatusCode);

        Assert.Equal(HttpStatusCode.BadRequest, (await shopper.SendAsync(HttpMethod.Post, $"/api/v1/checkout/{id}/submit",
            new { email = "a@b.com", shippingMethodId = Guid.NewGuid() })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await shopper.SendAsync(HttpMethod.Post, $"/api/v1/checkout/{id}/submit",
            new { email = "a@b.com", shippingMethodId = deliveryId })).StatusCode); // envío sin dirección
        var submitted = await shopper.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/checkout/{id}/submit",
            new { email = "a@b.com", shippingMethodId = pickup.GetProperty("id").GetGuid() });
        Assert.Equal("Local 1", submitted.GetProperty("shippingAddress").GetString());

        // Confirmar dos veces: la sesión ya no está abierta.
        Assert.Equal(HttpStatusCode.Conflict, (await shopper.SendAsync(HttpMethod.Post, $"/api/v1/checkout/{id}/submit", new { email = "a@b.com" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await shopper.SendAsync(HttpMethod.Post, $"/api/v1/checkout/{Guid.NewGuid()}/submit", new { email = "a@b.com" })).StatusCode);

        // Sin stock suficiente (quedan 2: una unidad quedó reservada).
        var greedy = await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/checkout", new { lines = new[] { new { variantId, quantity = 3 } } });
        Assert.Equal(HttpStatusCode.Conflict, (await shopper.SendAsync(HttpMethod.Post, $"/api/v1/checkout/{greedy.GetProperty("id").GetGuid()}/submit", new { email = "a@b.com" })).StatusCode);

        // Carrito vacío o de una variante que no existe.
        Assert.Equal(HttpStatusCode.BadRequest, (await shopper.SendAsync(HttpMethod.Post, "/api/v1/checkout", new { lines = Array.Empty<object>() })).StatusCode);
        Assert.False((await shopper.SendAsync(HttpMethod.Post, "/api/v1/checkout", new { lines = new[] { new { variantId = Guid.NewGuid(), quantity = 1 } } })).IsSuccessStatusCode);

        // Lo que pide el checkout: lo configura la tienda, lo lee el storefront.
        await merchant.PutAsync("/api/v1/admin/checkout/settings", new
        {
            singleColumn = true, requirePhone = true, requireDocument = true, customerNoteEnabled = true,
            customerNoteLabel = "¿Algo para el repartidor?", orderMessageEnabled = true, orderMessageText = "¡Gracias!",
        });
        Assert.True((await merchant.GetAsync("/api/v1/admin/checkout/settings")).GetProperty("requireDocument").GetBoolean());
        var settings = await shopper.ExpectJsonAsync(HttpMethod.Get, "/api/v1/checkout-settings");
        Assert.Equal("¿Algo para el repartidor?", settings.GetProperty("customerNoteLabel").GetString());

        await merchant.ExpectOkAsync(HttpMethod.Delete, $"/api/v1/admin/shipping/methods/{deliveryId}");
    }

    // ---------------------------------------------------------------- helpers

    private static async Task<HttpResponseMessage> SubmitAsync(
        Shopper shopper, Guid variantId, int quantity, string quoteToken, string? address = null, string? agency = null)
    {
        var start = await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/checkout", new { lines = new[] { new { variantId, quantity } } });
        return await shopper.SendAsync(HttpMethod.Post, $"/api/v1/checkout/{start.GetProperty("id").GetGuid()}/submit", new
        {
            email = "comprador@test.local",
            name = "Ana",
            shippingQuoteToken = quoteToken,
            address,
            correoAgency = agency,
        });
    }

    /// <summary>Los tres carriers configurados y cotizando (APIs simuladas).</summary>
    private async Task ConfigureCarriersAsync(Merchant merchant)
    {
        var userToken = $"user-{merchant.Subdomain}";
        await merchant.PutAsync("/api/v1/admin/shipping/correo", new
        {
            userToken, passwordToken = "p", customerId = "0009", environment = "TEST", originPostalCode = "1425",
            offerHomeDelivery = true, offerAgencyDelivery = true, active = true,
        });
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Correo}/token", new { token = "jwt" });
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Correo}/rates", new
        {
            rates = new[]
            {
                new { deliveredType = "D", productType = "CP", productName = "Clásico", price = 5200m, deliveryTimeMin = "3", deliveryTimeMax = "6" },
                new { deliveredType = "S", productType = "CP", productName = "Clásico", price = 4100m, deliveryTimeMin = "3", deliveryTimeMax = "6" },
            },
        });
        // Provincia Q (Neuquén): propia de este test, por el cache de 12 h de sucursales.
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Correo}/agencies?provinceCode=Q", new[]
        {
            new { code = "Q0001", name = "Centro", status = "ACTIVE", services = new { packageReception = true, pickupAvailability = true },
                  location = new { address = new { streetName = "Av. Argentina", streetNumber = "200", locality = "Neuquén" } } },
        });

        await merchant.PutAsync("/api/v1/admin/shipping/zipnova", new { apiToken = "zt", apiSecret = "zs", country = "AR", accountId = 1, originId = "auto", active = true });
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Zipnova}/shipments/quote", new
        {
            all_results = new[]
            {
                new { selectable = true, carrier = new { id = 1, name = "OCA" }, service_type = new { id = 1, code = "standard_delivery", name = "Estándar" },
                      delivery_time = new { estimated_delivery = "2026-10-20" }, amounts = new { price = 3000m, price_incl_tax = 3630m } },
            },
        });

        await merchant.PutAsync("/api/v1/admin/shipping/andreani", new
        {
            username = "u", password = "p", homeDeliveryContract = "300006611", branchPickupContract = "400006709", useQa = false,
            senderName = "Tienda", senderEmail = "t@t.com", senderDocumentType = "CUIT", senderDocumentNumber = "30712345678",
            originStreet = "Calle", originNumber = "1", originCity = "CABA", originPostalCode = "1425",
            weightGrams = 1000, lengthCm = 30, widthCm = 20, heightCm = 15, active = true,
        });
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Andreani}/v1/tarifas", new { tarifaConIva = new { total = "6000.00" }, tarifaSinIva = new { total = "4958.68" } });
    }
}
