using System.Net;
using Checkout.Core.Domain;

namespace IntegrationTests;

/// <summary>
/// Correo Argentino (MiCorreo) de punta a punta, con su API simulada en
/// <see cref="FakeHttp"/>: configurar → probar → cotizar en el checkout →
/// sucursales → alta del envío → seguimiento.
///
/// <para>
/// Lo delicado de MiCorreo es la autenticación en dos pasos (Basic para pedir
/// un JWT, Bearer con el JWT para todo lo demás) y que un JWT vencido se
/// renueva UNA vez y se reintenta. Las dos cosas se prueban acá.
/// </para>
/// </summary>
[Collection("api")]
public sealed class CorreoArgentinoFlowTests
{
    private const string Base = "https://apitest.correoargentino.com.ar/micorreo/v1";
    private readonly ApiFactory _factory;

    public CorreoArgentinoFlowTests(ApiFactory factory) => _factory = factory;

    /// <summary>Cada test con su userToken: el JWT se cachea por token.</summary>
    private static object Config(string userToken, string? customerId = "0001234567", string? email = null) => new
    {
        userToken,
        passwordToken = "pass-token",
        customerId,
        miCorreoEmail = email,
        miCorreoPassword = email is null ? null : "clave-micorreo",
        environment = "TEST",
        originPostalCode = "1425",
        defaultWeightGrams = 800,
        defaultLengthCm = 30,
        defaultWidthCm = 20,
        defaultHeightCm = 10,
        offerHomeDelivery = true,
        offerAgencyDelivery = true,
        active = true,
    };

    private void StubToken(string jwt = "jwt-1") =>
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Base}/token", new { token = jwt, expires = "2026-10-11 23:00:00" });

    private void StubRates() =>
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Base}/rates", new
        {
            customerId = "0001234567",
            validTo = "2026-10-12T00:00:00",
            rates = new[]
            {
                new { deliveredType = "D", productType = "CP", productName = "Correo Argentino Clásico", price = 5200.50m, deliveryTimeMin = "2", deliveryTimeMax = "5" },
                new { deliveredType = "S", productType = "CP", productName = "Correo Argentino Clásico", price = 3900.00m, deliveryTimeMin = "2", deliveryTimeMax = "5" },
            },
        });

    /// <summary>
    /// El seguimiento como lo atiende MiCorreo: el <c>shippingId</c> va en el
    /// cuerpo del GET. Sin cuerpo, la API real responde 415.
    /// </summary>
    private void StubTracking(object response) =>
        _factory.ExternalHttp.On(HttpMethod.Get, $"{Base}/shipping/tracking", (req, body) =>
            string.IsNullOrEmpty(body) || !string.IsNullOrEmpty(req.RequestUri!.Query)
                ? new HttpResponseMessage(HttpStatusCode.UnsupportedMediaType)
                : FakeHttp.Json(response));

    [Fact]
    public async Task Configurar_cotizar_sucursales_alta_y_seguimiento()
    {
        var merchant = await Merchant.CreateAsync(_factory, "cor");
        var userToken = $"user-{merchant.Subdomain}";

        Assert.False((await merchant.GetAsync("/api/v1/admin/shipping/correo")).GetProperty("configured").GetBoolean());

        // Sin tokens no se puede guardar.
        var noCreds = await merchant.SendAsync(HttpMethod.Put, "/api/v1/admin/shipping/correo", new { customerId = "1" });
        Assert.Equal(HttpStatusCode.BadRequest, noCreds.StatusCode);

        // El customerId se obtiene validando email y contraseña de MiCorreo
        // (que no se guardan).
        StubToken();
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Base}/users/validate", new { customerId = "0001234567", createdAt = "2024-01-01" });
        var saved = await merchant.PutAsync("/api/v1/admin/shipping/correo", Config(userToken, customerId: null, email: "yo@tienda.com"));
        Assert.Equal("0001234567", saved.GetProperty("customerId").GetString());
        Assert.DoesNotContain(userToken, saved.ToString()); // los tokens no vuelven
        Assert.Contains("clave-micorreo", _factory.ExternalHttp.SentTo($"{Base}/users/validate").Last().Body);

        // Editar sin tokens conserva los guardados.
        var edited = await merchant.PutAsync("/api/v1/admin/shipping/correo", new { originPostalCode = "1426" });
        Assert.Equal("1426", edited.GetProperty("originPostalCode").GetString());

        // Prueba con cotización real.
        StubRates();
        var test = await merchant.PostAsync("/api/v1/admin/shipping/correo/test", new { postalCode = "5000" });
        Assert.True(test.GetProperty("ok").GetBoolean());
        Assert.Equal(2, test.GetProperty("rates").GetArrayLength());
        var rates = _factory.ExternalHttp.SentTo($"{Base}/rates").Last();
        Assert.Equal("Bearer jwt-1", rates.Headers["Authorization"]);

        // Cotización del checkout: ordenada por precio, con token firmado.
        var quote = await merchant.PostAsync("/api/v1/shipping/correo/quote", new { postalCode = "B1636", units = 2 });
        var options = quote.GetProperty("options").EnumerateArray().ToList();
        Assert.Equal(2, options.Count);
        Assert.Equal("S", options[0].GetProperty("kind").GetString()); // la sucursal es más barata
        Assert.Equal(390000, options[0].GetProperty("price").GetProperty("amount").GetInt64());
        Assert.Contains("retiro en sucursal", options[0].GetProperty("name").GetString());

        // Validaciones de la cotización.
        Assert.Equal(HttpStatusCode.BadRequest,
            (await merchant.SendAsync(HttpMethod.Post, "/api/v1/shipping/correo/quote", new { postalCode = "x", units = 1 })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await merchant.SendAsync(HttpMethod.Post, "/api/v1/shipping/correo/quote", new { postalCode = "1636", units = 0 })).StatusCode);
        // Demasiadas unidades superan los 25 kg: no hay opciones, pero no es error.
        var tooHeavy = await merchant.PostAsync("/api/v1/shipping/correo/quote", new { postalCode = "1636", units = 999 });
        Assert.Empty(tooHeavy.GetProperty("options").EnumerateArray());

        // Sucursales: solo las activas que reciben paquetes.
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Base}/agencies", new object[]
        {
            new { code = "B0101", name = "Olivos", status = "ACTIVE", services = new { packageReception = true, pickupAvailability = true },
                  location = new { address = new { streetName = "Maipú", streetNumber = "1200", locality = "Olivos" } } },
            new { code = "B0102", name = "Cerrada", status = "INACTIVE", services = new { packageReception = true, pickupAvailability = true } },
            new { code = "B0103", name = "Sin paquetes", status = "ACTIVE", services = new { packageReception = false, pickupAvailability = true } },
        });
        var agencies = await merchant.GetAsync("/api/v1/shipping/correo/agencies?province=B");
        var agency = Assert.Single(agencies.GetProperty("items").EnumerateArray());
        Assert.Equal("Maipú 1200, Olivos", agency.GetProperty("address").GetString());
        Assert.Equal(HttpStatusCode.BadRequest,
            (await merchant.SendAsync(HttpMethod.Get, "/api/v1/shipping/correo/agencies?province=bb")).StatusCode);

        // Alta del envío de una venta. A sucursal: hace falta elegirla.
        var orderId = await merchant.CreateSaleAsync();
        Assert.False((await merchant.GetAsync($"/api/v1/admin/orders/{orderId}/correo-shipment")).GetProperty("exists").GetBoolean());
        var noAgency = await merchant.SendAsync(HttpMethod.Post, $"/api/v1/admin/orders/{orderId}/correo-shipment",
            new { deliveryType = "S", recipientName = "Ana", recipientEmail = "a@b.com" });
        Assert.Equal(HttpStatusCode.BadRequest, noAgency.StatusCode);

        // El JWT vencido (401) se renueva una vez.
        var calls = 0;
        _factory.ExternalHttp.On(HttpMethod.Post, $"{Base}/shipping/import", (_, _) =>
            ++calls == 1
                ? new HttpResponseMessage(HttpStatusCode.Unauthorized)
                : FakeHttp.Json(new { createdAt = "2026-10-11T12:00:00" }));
        var shipment = await merchant.PostAsync($"/api/v1/admin/orders/{orderId}/correo-shipment", new
        {
            deliveryType = "D",
            recipientName = "Ana Pérez",
            recipientEmail = "ana@mail.com",
            recipientPhone = "1155556666",
            streetName = "Corrientes",
            streetNumber = "1234",
            floor = "3",
            apartment = "B",
            city = "CABA",
            provinceCode = "c",
            postalCode = "1043",
            declaredValue = 50_000m,
        });
        Assert.True(shipment.GetProperty("ok").GetBoolean());
        Assert.False(shipment.GetProperty("alreadyExisted").GetBoolean());
        Assert.Equal("2026-10-11T12:00:00", shipment.GetProperty("createdAt").GetString());
        Assert.Equal(2, calls);
        Assert.Contains("\"provinceCode\":\"C\"", _factory.ExternalHttp.SentTo($"{Base}/shipping/import").Last().Body);

        // El alta queda registrada: la venta no se da de alta dos veces.
        var registered = await merchant.GetAsync($"/api/v1/admin/orders/{orderId}/correo-shipment");
        Assert.True(registered.GetProperty("exists").GetBoolean());
        Assert.Equal("D", registered.GetProperty("deliveryType").GetString());
        var again = await merchant.PostAsync($"/api/v1/admin/orders/{orderId}/correo-shipment",
            new { deliveryType = "S", recipientName = "Ana", recipientEmail = "a@b.com", agency = "B0101" });
        Assert.True(again.GetProperty("alreadyExisted").GetBoolean());
        Assert.Equal(2, calls);

        // Seguimiento: el server responde array, objeto suelto o error.
        StubTracking(new[]
        {
            new
            {
                trackingNumber = "000500076393019A3G0C701",
                events = new[]
                {
                    new { @event = "PREIMPOSICION", date = "11-10-2026 12:00", branch = "CABA", status = "OK" },
                    new { @event = "EN DISTRIBUCION", date = "02-11-2026 09:30", branch = "CABA", status = "OK" },
                },
            },
        });
        var tracking = await merchant.GetAsync("/api/v1/admin/shipping/correo/tracking?shippingId=000500076393019A3G0C701");
        var item = Assert.Single(tracking.GetProperty("items").EnumerateArray());
        var trackingSent = _factory.ExternalHttp.SentTo($"{Base}/shipping/tracking").Last();
        Assert.Equal("{\"shippingId\":\"000500076393019A3G0C701\"}", trackingSent.Body);
        Assert.Equal("", trackingSent.Uri.Query);
        // Del más nuevo al más viejo, con la fecha leída día-mes-año: el panel muestra el primero.
        Assert.Equal("EN DISTRIBUCION", item.GetProperty("events")[0].GetProperty("event").GetString());

        StubTracking(new { trackingNumber = "X1", events = (object?)null });
        Assert.Single((await merchant.GetAsync("/api/v1/admin/shipping/correo/tracking?shippingId=X1")).GetProperty("items").EnumerateArray());

        StubTracking(new { date = "hoy", error = "Envío inexistente", code = "404" });
        var missing = await merchant.SendAsync(HttpMethod.Get, "/api/v1/admin/shipping/correo/tracking?shippingId=NOPE");
        Assert.Equal(HttpStatusCode.BadRequest, missing.StatusCode);
        Assert.Contains("Envío inexistente", await missing.Content.ReadAsStringAsync());

        await merchant.ExpectOkAsync(HttpMethod.Delete, "/api/v1/admin/shipping/correo");
        Assert.False((await merchant.GetAsync("/api/v1/admin/shipping/correo")).GetProperty("configured").GetBoolean());
    }

    [Fact]
    public async Task Con_MiCorreo_caido_el_checkout_sigue_y_el_panel_explica()
    {
        var merchant = await Merchant.CreateAsync(_factory, "coe");
        var userToken = $"user-{merchant.Subdomain}";

        // Sin configurar: nada que probar ni despachar, y el checkout no ofrece Correo.
        Assert.Equal(HttpStatusCode.BadRequest,
            (await merchant.SendAsync(HttpMethod.Post, "/api/v1/admin/shipping/correo/test", new { })).StatusCode);
        Assert.False((await merchant.PostAsync("/api/v1/shipping/correo/quote", new { postalCode = "1043", units = 1 }))
            .GetProperty("available").GetBoolean());
        Assert.Empty((await merchant.GetAsync("/api/v1/shipping/correo/agencies?province=B")).GetProperty("items").EnumerateArray());
        Assert.Equal(HttpStatusCode.BadRequest,
            (await merchant.SendAsync(HttpMethod.Get, "/api/v1/admin/shipping/correo/tracking?shippingId=1")).StatusCode);
        var orderId = await merchant.CreateSaleAsync();
        Assert.Equal(HttpStatusCode.BadRequest,
            (await merchant.SendAsync(HttpMethod.Post, $"/api/v1/admin/orders/{orderId}/correo-shipment", new { })).StatusCode);

        // Sin customerId ni forma de obtenerlo.
        Assert.Equal(HttpStatusCode.BadRequest,
            (await merchant.SendAsync(HttpMethod.Put, "/api/v1/admin/shipping/correo", Config(userToken, customerId: null))).StatusCode);

        // Credenciales inválidas al validar el usuario.
        _factory.ExternalHttp.On(HttpMethod.Post, $"{Base}/token", (_, _) => new HttpResponseMessage(HttpStatusCode.Unauthorized));
        var invalid = await merchant.SendAsync(HttpMethod.Put, "/api/v1/admin/shipping/correo",
            Config(userToken, customerId: null, email: "yo@tienda.com"));
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        Assert.Contains("inválidas", await invalid.Content.ReadAsStringAsync());

        // Guardado con customerId directo, y MiCorreo caído al cotizar.
        await merchant.PutAsync("/api/v1/admin/shipping/correo", Config(userToken));
        StubToken("jwt-caido");
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Base}/rates", new { message = "Servicio no disponible" }, HttpStatusCode.ServiceUnavailable);

        var quote = await merchant.PostAsync("/api/v1/shipping/correo/quote", new { postalCode = "1043", units = 1 });
        Assert.True(quote.GetProperty("available").GetBoolean());
        Assert.Empty(quote.GetProperty("options").EnumerateArray());
        Assert.False(string.IsNullOrEmpty(quote.GetProperty("error").GetString()));

        var test = await merchant.SendAsync(HttpMethod.Post, "/api/v1/admin/shipping/correo/test", new { });
        Assert.Equal(HttpStatusCode.BadRequest, test.StatusCode);
        Assert.Contains("Servicio no disponible", await test.Content.ReadAsStringAsync());

        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Base}/agencies", new { message = "caído" }, HttpStatusCode.BadGateway);
        Assert.Empty((await merchant.GetAsync("/api/v1/shipping/correo/agencies?province=Z")).GetProperty("items").EnumerateArray());

        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Base}/shipping/import", new { message = "CP inválido" }, HttpStatusCode.BadRequest);
        var import = await merchant.SendAsync(HttpMethod.Post, $"/api/v1/admin/orders/{orderId}/correo-shipment", new
        {
            deliveryType = "S",
            recipientName = "Ana",
            recipientEmail = "a@b.com",
            agency = "B0101",
        });
        Assert.Equal(HttpStatusCode.BadRequest, import.StatusCode);
        Assert.Contains("CP inválido", await import.Content.ReadAsStringAsync());

        // El rechazo no deja la venta trabada: corregido, el alta sale.
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Base}/shipping/import", new { createdAt = "2026-10-12T09:00:00" });
        var retried = await merchant.PostAsync($"/api/v1/admin/orders/{orderId}/correo-shipment", new
        {
            deliveryType = "S",
            recipientName = "Ana",
            recipientEmail = "a@b.com",
            agency = "B0102",
        });
        Assert.False(retried.GetProperty("alreadyExisted").GetBoolean());
        Assert.Equal("B0102", retried.GetProperty("agency").GetString());
    }

    [Fact]
    public async Task Dos_altas_a_la_vez_dan_de_alta_la_venta_una_sola_vez()
    {
        var merchant = await Merchant.CreateAsync(_factory, "coz");
        await merchant.PutAsync("/api/v1/admin/shipping/correo", Config($"user-{merchant.Subdomain}"));
        StubToken();
        var orderId = await merchant.CreateSaleAsync();
        var url = $"/api/v1/admin/orders/{orderId}/correo-shipment";
        var import = $"{Base}/shipping/import";
        var before = _factory.ExternalHttp.SentTo(import).Count;
        var body = new { deliveryType = "S", recipientName = "Ana", recipientEmail = "a@b.com", agency = "B0101" };

        var (first, second) = await CarrierRace.RunAsync(_factory.ExternalHttp, HttpMethod.Post, import,
            () => FakeHttp.Json(new { createdAt = "2026-10-11T12:00:00" }),
            () => merchant.SendAsync(HttpMethod.Post, url, body));

        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
        Assert.Contains("envío en curso", await second.Content.ReadAsStringAsync());
        Assert.Equal(before + 1, _factory.ExternalHttp.SentTo(import).Count);

        var again = await merchant.PostAsync(url, body);
        Assert.True(again.GetProperty("alreadyExisted").GetBoolean());
        Assert.Equal(before + 1, _factory.ExternalHttp.SentTo(import).Count);
    }

    [Fact]
    public async Task Cotizar_con_MiCorreo_sin_respuesta_no_rompe_el_checkout()
    {
        var merchant = await Merchant.CreateAsync(_factory, "cot");
        await merchant.PutAsync("/api/v1/admin/shipping/correo", Config($"user-{merchant.Subdomain}"));
        StubToken();

        // La red caída y el timeout son lo mismo para el comprador: Correo no
        // ofrece opciones y el checkout sigue con los demás medios.
        foreach (var failure in new Exception[] { new HttpRequestException("sin red"), new TaskCanceledException("timeout") })
        {
            _factory.ExternalHttp.On(HttpMethod.Post, $"{Base}/rates", (_, _) => throw failure);
            var quote = await merchant.PostAsync("/api/v1/shipping/correo/quote", new { postalCode = "1043", units = 1 });
            Assert.True(quote.GetProperty("available").GetBoolean());
            Assert.Empty(quote.GetProperty("options").EnumerateArray());
            Assert.False(string.IsNullOrEmpty(quote.GetProperty("error").GetString()));
        }
    }

    [Fact]
    public async Task Si_MiCorreo_no_responde_el_panel_lo_dice_en_vez_de_un_500()
    {
        var merchant = await Merchant.CreateAsync(_factory, "cox");
        var userToken = $"user-{merchant.Subdomain}";
        StubToken();
        await merchant.PutAsync("/api/v1/admin/shipping/correo", Config(userToken));

        _factory.ExternalHttp.On(HttpMethod.Post, $"{Base}/rates", (_, _) => throw new TaskCanceledException("timeout"));
        _factory.ExternalHttp.On(HttpMethod.Get, $"{Base}/shipping/tracking", (_, _) => throw new HttpRequestException("sin red"));
        _factory.ExternalHttp.On(HttpMethod.Post, $"{Base}/users/validate", (_, _) => throw new TaskCanceledException("timeout"));

        var responses = new[]
        {
            await merchant.SendAsync(HttpMethod.Post, "/api/v1/admin/shipping/correo/test", new { }),
            await merchant.SendAsync(HttpMethod.Get, "/api/v1/admin/shipping/correo/tracking?shippingId=X1"),
            // Obtener el customerId con el email y la contraseña de MiCorreo.
            await merchant.SendAsync(HttpMethod.Put, "/api/v1/admin/shipping/correo",
                Config(userToken, customerId: null, email: "yo@tienda.com")),
        };
        foreach (var res in responses)
        {
            Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
            Assert.Contains("Correo Argentino no respondió a tiempo", await res.Content.ReadAsStringAsync());
        }
    }

    [Fact]
    public async Task Un_alta_a_revisar_se_registra_o_se_libera_desde_la_venta()
    {
        var merchant = await Merchant.CreateAsync(_factory, "cov");
        await merchant.PutAsync("/api/v1/admin/shipping/correo", Config($"user-{merchant.Subdomain}"));
        var orderId = await merchant.CreateSaleAsync();
        var url = $"/api/v1/admin/orders/{orderId}/correo-shipment";

        // Sin nada a revisar, registrar es un 409.
        Assert.Equal(HttpStatusCode.Conflict, (await merchant.SendAsync(HttpMethod.Post, $"{url}/review/record")).StatusCode);

        await StuckShipment.LeaveAsync(_factory, merchant.TenantId, orderId, ShipmentCarriers.Correo, "alta de la venta #1");
        Assert.Equal("alta de la venta #1",
            (await merchant.GetAsync(url)).GetProperty("review").GetProperty("note").GetString());

        // Otra tienda no la ve ni la toca.
        var other = await Merchant.CreateAsync(_factory, "cow");
        Assert.Equal(HttpStatusCode.NotFound, (await other.SendAsync(HttpMethod.Post, $"{url}/review/release")).StatusCode);
        Assert.Equal(System.Text.Json.JsonValueKind.Null, (await other.GetAsync(url)).GetProperty("review").ValueKind);

        // "Se creó": queda registrada el alta (MiCorreo no da número al dar de alta).
        var recorded = await merchant.PostAsync($"{url}/review/record", new { });
        Assert.True(recorded.GetProperty("exists").GetBoolean());
        Assert.True((await merchant.GetAsync(url)).GetProperty("exists").GetBoolean());

        // Ya resuelta: ni registrarla de nuevo ni liberarla.
        Assert.Equal(HttpStatusCode.Conflict, (await merchant.SendAsync(HttpMethod.Post, $"{url}/review/record")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await merchant.SendAsync(HttpMethod.Post, $"{url}/review/release")).StatusCode);
    }
}
