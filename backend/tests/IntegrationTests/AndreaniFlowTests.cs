using System.Net;
using Checkout.Core.Domain;

namespace IntegrationTests;

/// <summary>
/// Andreani de punta a punta, con la API de Andreani simulada en
/// <see cref="FakeHttp"/>: configurar → cotizar en el checkout → despachar una
/// venta → etiqueta → seguimiento.
///
/// <para>
/// Las respuestas simuladas copian la forma de las reales (medidas contra la
/// API de QA): token en un header, importes como texto con punto, trazas con
/// campos en mayúscula. Son esas rarezas las que el adaptador tiene que leer
/// bien, y es lo que se prueba.
/// </para>
/// </summary>
[Collection("api")]
public sealed class AndreaniFlowTests
{
    private const string Base = AndreaniConfig.ProductionBaseUrl;
    private readonly ApiFactory _factory;

    public AndreaniFlowTests(ApiFactory factory) => _factory = factory;

    private static object Config(string? password = "secreta", string? branchContract = "400006709") => new
    {
        username = "usuario-andreani",
        password,
        clientCode = "CL0003750",
        homeDeliveryContract = "300006611",
        branchPickupContract = branchContract,
        originBranch = "BAR",
        useQa = false,
        volumetricFactor = (decimal?)null,
        senderName = "Tienda SRL",
        senderEmail = "ventas@tienda.com",
        senderDocumentType = "CUIT",
        senderDocumentNumber = "30712345678",
        senderPhone = "1145678900",
        originStreet = "Av. Santa Fe",
        originNumber = "3253",
        originCity = "C.A.B.A.",
        originPostalCode = "1425",
        weightGrams = 1000,
        lengthCm = 30,
        widthCm = 20,
        heightCm = 15,
        active = true,
    };

    private static object Recipient(bool toBranch = false, string email = "cliente@mail.com") => new
    {
        name = "Ana Pérez",
        email,
        documentType = "DNI",
        documentNumber = "30111222",
        phone = "1155556666",
        street = "Corrientes",
        streetNumber = "1234",
        city = "CABA",
        region = "CABA",
        postalCode = "C1043AAZ",
        extras = "Timbre 3B",
        units = 2,
        declaredValue = 100_000m,
        toBranch,
        branchId = toBranch ? "BAR" : null,
    };

    private void StubLogin(string token = "tok-123") =>
        _factory.ExternalHttp.On(HttpMethod.Post, $"{Base}/login", (_, _) =>
        {
            var res = new HttpResponseMessage(HttpStatusCode.OK);
            res.Headers.Add("x-authorization-token", token);
            return res;
        });

    [Fact]
    public async Task Configurar_cotizar_despachar_etiqueta_y_seguimiento()
    {
        var merchant = await Merchant.CreateAsync(_factory, "and");

        // Sin configurar: no cotiza y no despacha.
        var status = await merchant.GetAsync("/api/v1/admin/shipping/andreani");
        Assert.False(status.GetProperty("configured").GetBoolean());
        var noQuote = await merchant.PostAsync("/api/v1/shipping/andreani/quote", new { postalCode = "1043", units = 1 });
        Assert.False(noQuote.GetProperty("available").GetBoolean());

        // La primera vez la contraseña es obligatoria.
        var sinClave = await merchant.SendAsync(HttpMethod.Put, "/api/v1/admin/shipping/andreani", Config(password: null));
        Assert.Equal(HttpStatusCode.BadRequest, sinClave.StatusCode);

        var saved = await merchant.PutAsync("/api/v1/admin/shipping/andreani", Config());
        Assert.True(saved.GetProperty("canCreateShipments").GetBoolean());

        // La contraseña se guarda cifrada y nunca vuelve al panel.
        status = await merchant.GetAsync("/api/v1/admin/shipping/andreani");
        Assert.True(status.GetProperty("hasPassword").GetBoolean());
        Assert.DoesNotContain("secreta", status.ToString());
        Assert.Equal(9000, status.GetProperty("unitVolumeCm").GetInt32());

        // Editar sin contraseña conserva la guardada.
        await merchant.PutAsync("/api/v1/admin/shipping/andreani", Config(password: ""));

        // Probar credenciales: una vez mal, una vez bien.
        _factory.ExternalHttp.On(HttpMethod.Post, $"{Base}/login", (_, _) => new HttpResponseMessage(HttpStatusCode.Unauthorized));
        var bad = await merchant.PostAsync("/api/v1/admin/shipping/andreani/test", new { });
        Assert.False(bad.GetProperty("ok").GetBoolean());
        Assert.Contains("incorrectos", bad.GetProperty("message").GetString());

        StubLogin();
        var good = await merchant.PostAsync("/api/v1/admin/shipping/andreani/test", new { });
        Assert.True(good.GetProperty("ok").GetBoolean());
        // El login va con Basic, no con Bearer.
        Assert.StartsWith("Basic ", _factory.ExternalHttp.SentTo($"{Base}/login").Last().Headers["Authorization"]);

        // Cotizar: una tarifa por contrato, con importes como texto con punto.
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Base}/v1/tarifas", new
        {
            pesoAforado = "3150.0",
            tarifaSinIva = new { total = "4799.15" },
            tarifaConIva = new { total = "5806.97" },
        });
        var quote = await merchant.PostAsync("/api/v1/shipping/andreani/quote",
            new { postalCode = "C1043AAZ", units = 2, declaredValue = 100_000m });
        Assert.True(quote.GetProperty("available").GetBoolean());
        var options = quote.GetProperty("options").EnumerateArray().ToList();
        Assert.Equal(2, options.Count); // domicilio y sucursal
        Assert.Contains(options, o => o.GetProperty("toBranch").GetBoolean());
        Assert.All(options, o => Assert.False(string.IsNullOrEmpty(o.GetProperty("token").GetString())));
        // 5806.97 y no 580697: el importe se lee con cultura invariante.
        Assert.Equal(580697, options[0].GetProperty("price").GetProperty("amount").GetInt64());

        var tarifas = Uri.UnescapeDataString(_factory.ExternalHttp.SentTo($"{Base}/v1/tarifas").Last().Uri.ToString());
        Assert.Contains("cpDestino=1043", tarifas);
        Assert.Contains("bultos[1][volumen]=9000", tarifas);

        // Validaciones de la cotización.
        var badZip = await merchant.SendAsync(HttpMethod.Post, "/api/v1/shipping/andreani/quote", new { postalCode = "12", units = 1 });
        Assert.Equal(HttpStatusCode.BadRequest, badZip.StatusCode);
        var emptyCart = await merchant.SendAsync(HttpMethod.Post, "/api/v1/shipping/andreani/quote", new { postalCode = "1043", units = 0 });
        Assert.Equal(HttpStatusCode.BadRequest, emptyCart.StatusCode);

        // Despachar una venta.
        var orderId = await merchant.CreateSaleAsync();
        var none = await merchant.GetAsync($"/api/v1/admin/orders/{orderId}/andreani-shipment");
        Assert.False(none.GetProperty("exists").GetBoolean());

        var tooLong = await merchant.SendAsync(HttpMethod.Post, $"/api/v1/admin/orders/{orderId}/andreani-shipment",
            Recipient(email: new string('a', 35) + "@mail.com"));
        Assert.Equal(HttpStatusCode.BadRequest, tooLong.StatusCode);

        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Base}/ordenes-de-envio", new
        {
            estado = "Pendiente",
            sucursalDeDistribucion = new { descripcion = "BARRACAS" },
            bultos = new object[]
            {
                new
                {
                    numeroDeEnvio = "360000000036820",
                    linking = new[] { new { meta = "Etiqueta", contenido = $"{Base}/v2/360000000036820/etiquetas" } },
                },
                new { numeroDeEnvio = "360000000036830", linking = Array.Empty<object>() },
            },
        });
        var shipment = await merchant.PostAsync($"/api/v1/admin/orders/{orderId}/andreani-shipment", Recipient());
        Assert.Equal("360000000036820", shipment.GetProperty("trackingNumber").GetString());
        Assert.Equal(2, shipment.GetProperty("allTrackingNumbers").GetArrayLength());
        Assert.True(shipment.GetProperty("hasLabel").GetBoolean());
        Assert.Equal("BARRACAS", shipment.GetProperty("branchName").GetString());

        var sent = _factory.ExternalHttp.SentTo($"{Base}/ordenes-de-envio").Last();
        Assert.Equal("tok-123", sent.Headers["x-authorization-token"]);
        Assert.Contains("\"volumenCm\":9000", sent.Body);
        Assert.Contains("Timbre 3B", sent.Body);

        // Andreani no deduplica: el segundo pedido devuelve el envío que ya hay
        // sin mandar otra orden.
        var before = _factory.ExternalHttp.SentTo($"{Base}/ordenes-de-envio").Count;
        var again = await merchant.PostAsync($"/api/v1/admin/orders/{orderId}/andreani-shipment", Recipient());
        Assert.True(again.GetProperty("alreadyExisted").GetBoolean());
        Assert.Equal(before, _factory.ExternalHttp.SentTo($"{Base}/ordenes-de-envio").Count);

        // Etiqueta.
        _factory.ExternalHttp.On(HttpMethod.Get, $"{Base}/v2/360000000036820/etiquetas", (_, _) =>
            new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent("%PDF-1.4"u8.ToArray()) });
        var label = await merchant.SendAsync(HttpMethod.Get, $"/api/v1/admin/orders/{orderId}/andreani-label");
        Assert.Equal(HttpStatusCode.OK, label.StatusCode);
        Assert.Equal("application/pdf", label.Content.Headers.ContentType?.MediaType);

        // Seguimiento: campos en mayúscula y hora argentina sin zona.
        // JSON literal: serializado en camelCase perdería justo las mayúsculas.
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Base}/envios/360000000036820/trazas", """
            {"eventos":[
              {"Fecha":"2026-10-01T10:00:00","EstadoId":5,"Estado":"Ingreso al circuito operativo","Sucursal":"BARRACAS"},
              {"Fecha":"2026-10-02T09:30:00","EstadoId":6,"Estado":"En distribución","MotivoId":1,"Motivo":"x"}
            ]}
            """);
        var tracking = await merchant.GetAsync($"/api/v1/admin/orders/{orderId}/andreani-tracking");
        Assert.Equal(AndreaniShipmentStatus.OutForDelivery, tracking.GetProperty("status").GetString());
        Assert.Equal(2, tracking.GetProperty("events").GetArrayLength());
    }

    /// <summary>La respuesta de Andreani a una orden de envío creada, con un bulto.</summary>
    private static HttpResponseMessage OrderCreated(string tracking) => FakeHttp.Json(new
    {
        estado = "Pendiente",
        bultos = new[] { new { numeroDeEnvio = tracking, linking = Array.Empty<object>() } },
    });

    [Fact]
    public async Task Dos_pedidos_a_la_vez_crean_un_solo_envio()
    {
        var merchant = await Merchant.CreateAsync(_factory, "anr");
        await merchant.PutAsync("/api/v1/admin/shipping/andreani", Config());
        StubLogin();
        var orderId = await merchant.CreateSaleAsync();
        var url = $"/api/v1/admin/orders/{orderId}/andreani-shipment";
        var orders = $"{Base}/ordenes-de-envio";
        var before = _factory.ExternalHttp.SentTo(orders).Count;

        var (first, second) = await CarrierRace.RunAsync(_factory.ExternalHttp, HttpMethod.Post, orders,
            () => OrderCreated("360000000099990"),
            () => merchant.SendAsync(HttpMethod.Post, url, Recipient()));

        // El primero crea; el segundo choca con la reserva y no llama a Andreani.
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
        Assert.Contains("envío en curso", await second.Content.ReadAsStringAsync());
        Assert.Equal(before + 1, _factory.ExternalHttp.SentTo(orders).Count);

        // Terminado el primero, la reserva se soltó y manda la fila guardada.
        var again = await merchant.PostAsync(url, Recipient());
        Assert.True(again.GetProperty("alreadyExisted").GetBoolean());
        Assert.Equal("360000000099990", again.GetProperty("trackingNumber").GetString());
        Assert.Equal(before + 1, _factory.ExternalHttp.SentTo(orders).Count);
    }

    [Fact]
    public async Task Si_Andreani_no_responde_o_rechaza_se_puede_reintentar()
    {
        var merchant = await Merchant.CreateAsync(_factory, "ant");
        await merchant.PutAsync("/api/v1/admin/shipping/andreani", Config());
        StubLogin();
        var orderId = await merchant.CreateSaleAsync();
        var url = $"/api/v1/admin/orders/{orderId}/andreani-shipment";
        var orders = $"{Base}/ordenes-de-envio";

        // Sin respuesta no se sabe si se creó: no es un 500, y se avisa que
        // hay que mirar el panel de Andreani antes de reintentar.
        _factory.ExternalHttp.On(HttpMethod.Post, orders, (_, _) => throw new HttpRequestException("conexión cortada"));
        var noAnswer = await merchant.SendAsync(HttpMethod.Post, url, Recipient());
        Assert.Equal(HttpStatusCode.BadGateway, noAnswer.StatusCode);
        Assert.Contains("revisalo en el panel de Andreani", await noAnswer.Content.ReadAsStringAsync());

        // Un rechazo con respuesta tampoco deja la venta trabada.
        _factory.ExternalHttp.OnJson(HttpMethod.Post, orders,
            new[] { new { code = "E1", property = "destino", message = "Sucursal inexistente" } }, HttpStatusCode.BadRequest);
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post, url, Recipient())).StatusCode);

        _factory.ExternalHttp.On(HttpMethod.Post, orders, (_, _) => OrderCreated("360000000099991"));
        var created = await merchant.PostAsync(url, Recipient());
        Assert.False(created.GetProperty("alreadyExisted").GetBoolean());
        Assert.Equal("360000000099991", created.GetProperty("trackingNumber").GetString());
    }

    [Fact]
    public async Task Retiro_en_sucursal_exige_la_sucursal_y_domicilio_exige_la_direccion()
    {
        var merchant = await Merchant.CreateAsync(_factory, "anb");
        await merchant.PutAsync("/api/v1/admin/shipping/andreani", Config());
        var orderId = await merchant.CreateSaleAsync();
        var url = $"/api/v1/admin/orders/{orderId}/andreani-shipment";
        var orders = $"{Base}/ordenes-de-envio";
        var before = _factory.ExternalHttp.SentTo(orders).Count;

        // Sucursal sin id y sin dirección: antes caía al destino postal y
        // reventaba con la calle vacía.
        var noBranch = await merchant.SendAsync(HttpMethod.Post, url, new
        {
            name = "Ana Pérez",
            email = "ana@mail.com",
            documentNumber = "30111222",
            toBranch = true,
            branchId = "  ",
        });
        Assert.Equal(HttpStatusCode.BadRequest, noBranch.StatusCode);
        Assert.Contains("id de la sucursal", await noBranch.Content.ReadAsStringAsync());

        // A domicilio, la dirección es obligatoria.
        var noAddress = await merchant.SendAsync(HttpMethod.Post, url, new
        {
            name = "Ana Pérez",
            email = "ana@mail.com",
            documentNumber = "30111222",
            toBranch = false,
            city = "CABA",
        });
        Assert.Equal(HttpStatusCode.BadRequest, noAddress.StatusCode);
        Assert.Contains("Completá calle", await noAddress.Content.ReadAsStringAsync());
        Assert.Equal(before, _factory.ExternalHttp.SentTo(orders).Count);

        // Con la sucursal, el destino es la sucursal aunque no haya dirección.
        StubLogin();
        _factory.ExternalHttp.On(HttpMethod.Post, orders, (_, _) => OrderCreated("360000000099992"));
        await merchant.PostAsync(url, new
        {
            name = "Ana Pérez",
            email = "ana@mail.com",
            documentNumber = "30111222",
            toBranch = true,
            branchId = "BAR",
        });
        var sent = _factory.ExternalHttp.SentTo(orders).Last().Body!;
        Assert.Contains("\"destino\":{\"sucursal\":{\"id\":\"BAR\"}}", sent);
    }

    [Fact]
    public async Task Los_errores_de_Andreani_llegan_al_panel_traducidos()
    {
        var merchant = await Merchant.CreateAsync(_factory, "ane");
        var orderId = await merchant.CreateSaleAsync();

        // Sin configurar.
        var notConfigured = await merchant.SendAsync(HttpMethod.Post, $"/api/v1/admin/orders/{orderId}/andreani-shipment", Recipient());
        Assert.Equal(HttpStatusCode.BadRequest, notConfigured.StatusCode);
        var notConfiguredTest = await merchant.SendAsync(HttpMethod.Post, "/api/v1/admin/shipping/andreani/test", new { });
        Assert.Equal(HttpStatusCode.BadRequest, notConfiguredTest.StatusCode);

        // Configurado solo con domicilio: retiro en sucursal no tiene contrato.
        await merchant.PutAsync("/api/v1/admin/shipping/andreani", Config(branchContract: null));
        var noBranch = await merchant.SendAsync(HttpMethod.Post, $"/api/v1/admin/orders/{orderId}/andreani-shipment", Recipient(toBranch: true));
        Assert.Equal(HttpStatusCode.BadRequest, noBranch.StatusCode);

        // Andreani rechaza con su formato de lista de errores.
        StubLogin();
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Base}/ordenes-de-envio",
            new[] { new { code = "E1", property = "destino", message = "El código postal no existe" } },
            HttpStatusCode.BadRequest);
        var rejected = await merchant.SendAsync(HttpMethod.Post, $"/api/v1/admin/orders/{orderId}/andreani-shipment", Recipient());
        Assert.Equal(HttpStatusCode.BadRequest, rejected.StatusCode);
        Assert.Contains("El código postal no existe", await rejected.Content.ReadAsStringAsync());

        // Sin envío no hay etiqueta ni seguimiento.
        Assert.Equal(HttpStatusCode.NotFound,
            (await merchant.SendAsync(HttpMethod.Get, $"/api/v1/admin/orders/{orderId}/andreani-label")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await merchant.SendAsync(HttpMethod.Get, $"/api/v1/admin/orders/{orderId}/andreani-tracking")).StatusCode);

        // Cotizar con Andreani caído no rompe el checkout: no hay opciones.
        _factory.ExternalHttp.On(HttpMethod.Get, $"{Base}/v1/tarifas", (_, _) => new HttpResponseMessage(HttpStatusCode.BadGateway));
        var quote = await merchant.PostAsync("/api/v1/shipping/andreani/quote", new { postalCode = "1043", units = 1 });
        Assert.Empty(quote.GetProperty("options").EnumerateArray());

        // Borrar la configuración, dos veces: la segunda no falla.
        await merchant.ExpectOkAsync(HttpMethod.Delete, "/api/v1/admin/shipping/andreani");
        await merchant.ExpectOkAsync(HttpMethod.Delete, "/api/v1/admin/shipping/andreani");
    }
}
