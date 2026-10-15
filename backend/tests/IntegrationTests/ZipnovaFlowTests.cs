using System.Net;
using System.Text;
using Checkout.Core.Domain;

namespace IntegrationTests;

/// <summary>
/// Zipnova de punta a punta, con su API simulada en <see cref="FakeHttp"/>:
/// configurar → probar → cotizar en el checkout → despachar → etiqueta →
/// seguimiento.
///
/// <para>
/// Lo particular de Zipnova: la etiqueta puede venir como PDF binario, como
/// base64 dentro de un JSON o como base64 pelado, según la cuenta; y el
/// seguimiento, como array suelto o envuelto en <c>data</c>. El adaptador
/// acepta todas las formas y acá se prueba cada una.
/// </para>
/// </summary>
[Collection("api")]
public sealed class ZipnovaFlowTests
{
    private const string Base = "https://api.zipnova.com.ar/v2";
    private readonly ApiFactory _factory;

    public ZipnovaFlowTests(ApiFactory factory) => _factory = factory;

    private static object Config(string? apiToken = "zn-token", string originId = "auto") => new
    {
        apiToken,
        apiSecret = apiToken is null ? null : "zn-secret",
        country = "AR",
        accountId = 4321,
        originId,
        defaultWeightGrams = 700,
        defaultLengthCm = 30,
        defaultWidthCm = 20,
        defaultHeightCm = 10,
        active = true,
    };

    private static object Recipient() => new
    {
        name = "Ana Pérez",
        document = "30111222",
        email = "ana@mail.com",
        phone = "1155556666",
        street = "Corrientes",
        streetNumber = "1234",
        streetExtras = "3B",
        city = "CABA",
        state = "Buenos Aires",
        zipcode = "C1043AAZ",
        units = 2,
        declaredValue = 50_000m,
    };

    private static object Quote() => new
    {
        all_results = new object[]
        {
            new { selectable = true, logistic_type = "crossdock", carrier = new { id = 1, name = "OCA" },
                  service_type = new { id = 1, code = "standard_delivery", name = "Estándar" },
                  delivery_time = new { estimated_delivery = "2026-10-15" }, amounts = new { price = 4000m, price_incl_tax = 4840m } },
            new { selectable = true, logistic_type = "crossdock", carrier = new { id = 2, name = "Andreani" },
                  service_type = new { id = 2, code = "standard_delivery", name = "Estándar" },
                  delivery_time = new { estimated_delivery = "2026-10-14" }, amounts = new { price = 3000m, price_incl_tax = 3630m } },
            // Punto de retiro y no seleccionables: no se ofrecen en el checkout.
            new { selectable = true, logistic_type = "crossdock", carrier = new { id = 3, name = "Pickit" },
                  service_type = new { id = 3, code = "pickup_point", name = "Punto de retiro" }, amounts = new { price = 1m, price_incl_tax = 1m } },
            new { selectable = false, carrier = new { id = 4, name = "Caro" }, amounts = new { price = 1m, price_incl_tax = 1m } },
        },
    };

    [Fact]
    public async Task Configurar_cotizar_despachar_etiqueta_y_seguimiento()
    {
        var merchant = await Merchant.CreateAsync(_factory, "zip");

        Assert.False((await merchant.GetAsync("/api/v1/admin/shipping/zipnova")).GetProperty("configured").GetBoolean());
        Assert.Equal(HttpStatusCode.BadRequest,
            (await merchant.SendAsync(HttpMethod.Put, "/api/v1/admin/shipping/zipnova", Config(apiToken: null))).StatusCode);
        // Origen inválido: tiene que ser un número o "auto".
        Assert.Equal(HttpStatusCode.BadRequest,
            (await merchant.SendAsync(HttpMethod.Put, "/api/v1/admin/shipping/zipnova", Config(originId: "depósito"))).StatusCode);

        var saved = await merchant.PutAsync("/api/v1/admin/shipping/zipnova", Config());
        Assert.Equal(4321, saved.GetProperty("accountId").GetInt32());
        Assert.DoesNotContain("zn-token", saved.ToString());
        // Editar sin credenciales las conserva; el origen pasa a uno fijo.
        var edited = await merchant.PutAsync("/api/v1/admin/shipping/zipnova", new { originId = "987" });
        Assert.Equal("987", edited.GetProperty("originId").GetString());

        // Probar: lista todo lo seleccionable.
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Base}/shipments/quote", Quote());
        var test = await merchant.PostAsync("/api/v1/admin/shipping/zipnova/test", new { });
        Assert.Equal(3, test.GetProperty("options").GetArrayLength());
        var sentQuote = _factory.ExternalHttp.SentTo($"{Base}/shipments/quote").Last();
        Assert.StartsWith("Basic ", sentQuote.Headers["Authorization"]);
        Assert.Contains("\"origin_id\":987", sentQuote.Body);

        // Checkout: sin punto de retiro, ordenado por precio, con token.
        var quote = await merchant.PostAsync("/api/v1/shipping/zipnova/quote",
            new { postalCode = "C1043AAZ", city = "CABA", state = "Buenos Aires", units = 2, declaredValue = 50_000m });
        var options = quote.GetProperty("options").EnumerateArray().ToList();
        Assert.Equal(2, options.Count);
        Assert.Contains("Andreani", options[0].GetProperty("name").GetString());
        Assert.Equal(363000, options[0].GetProperty("price").GetProperty("amount").GetInt64());
        Assert.Contains("\"zipcode\":\"1043\"", _factory.ExternalHttp.SentTo($"{Base}/shipments/quote").Last().Body);

        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/shipping/zipnova/quote",
            new { postalCode = "1043", units = 1 })).StatusCode); // sin ciudad ni provincia
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/shipping/zipnova/quote",
            new { postalCode = "1043", city = "CABA", state = "BA", units = 0 })).StatusCode);

        // Despachar.
        var orderId = await merchant.CreateSaleAsync();
        Assert.False((await merchant.GetAsync($"/api/v1/admin/orders/{orderId}/zipnova-shipment")).GetProperty("exists").GetBoolean());
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post,
            $"/api/v1/admin/orders/{orderId}/zipnova-shipment", new { name = "Ana" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post,
            $"/api/v1/admin/orders/{orderId}/zipnova-shipment",
            new { name = "Ana", document = "1", email = "a@b.com", phone = "1" })).StatusCode); // sin dirección

        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Base}/shipments", new
        {
            id = 778899L,
            external_id = "TF-x",
            carrier_tracking_id = "OCA123",
            carrier = new { id = 1, name = "OCA" },
            status = "new",
            status_name = "Nuevo",
            tracking = "https://zipnova.com.ar/t/778899",
        });
        var shipment = await merchant.PostAsync($"/api/v1/admin/orders/{orderId}/zipnova-shipment", Recipient());
        Assert.Equal(778899, shipment.GetProperty("shipmentId").GetInt64());
        Assert.Equal("OCA", shipment.GetProperty("carrier").GetString());
        var created = _factory.ExternalHttp.SentTo($"{Base}/shipments").Last(r => r.Uri.AbsolutePath.EndsWith("/shipments"));
        Assert.Contains("\"account_id\":4321", created.Body);
        Assert.Contains("\"street_extras\":\"3B\"", created.Body);

        // Idempotente: no manda un segundo envío.
        Assert.True((await merchant.PostAsync($"/api/v1/admin/orders/{orderId}/zipnova-shipment", Recipient()))
            .GetProperty("alreadyExisted").GetBoolean());

        // Etiqueta en sus tres formas.
        var pdf = "%PDF-1.4 etiqueta"u8.ToArray();
        _factory.ExternalHttp.On(HttpMethod.Get, $"{Base}/shipments/778899/label.pdf", (_, _) =>
            new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(pdf) });
        Assert.Equal(pdf, await LabelAsync(merchant, orderId));

        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Base}/shipments/778899/label.pdf", new { content = Convert.ToBase64String(pdf) });
        Assert.Equal(pdf, await LabelAsync(merchant, orderId));

        _factory.ExternalHttp.On(HttpMethod.Get, $"{Base}/shipments/778899/label.pdf", (_, _) =>
            new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(Convert.ToBase64String(pdf), Encoding.UTF8) });
        Assert.Equal(pdf, await LabelAsync(merchant, orderId));

        // Todavía no generada (409) y formato irreconocible.
        _factory.ExternalHttp.On(HttpMethod.Get, $"{Base}/shipments/778899/label.pdf", (_, _) => new HttpResponseMessage(HttpStatusCode.Conflict));
        Assert.Equal(HttpStatusCode.BadRequest,
            (await merchant.SendAsync(HttpMethod.Get, $"/api/v1/admin/orders/{orderId}/zipnova-label")).StatusCode);
        _factory.ExternalHttp.On(HttpMethod.Get, $"{Base}/shipments/778899/label.pdf", (_, _) =>
            new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("esto no es una etiqueta!") });
        Assert.Equal(HttpStatusCode.BadRequest,
            (await merchant.SendAsync(HttpMethod.Get, $"/api/v1/admin/orders/{orderId}/zipnova-label")).StatusCode);

        // Seguimiento: envuelto en data, y el estado más nuevo se guarda.
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Base}/shipments/778899/tracking", new
        {
            data = new[]
            {
                new { status = "in_transit", status_name = "En camino", created_at = "2026-10-12 10:00", description = "Salió" },
                new { status = "new", status_name = "Nuevo", created_at = "2026-10-11 10:00", description = "Creado" },
            },
        });
        var tracking = await merchant.GetAsync($"/api/v1/admin/orders/{orderId}/zipnova-tracking");
        Assert.Equal(2, tracking.GetProperty("events").GetArrayLength());
        Assert.Equal("in_transit", (await merchant.GetAsync($"/api/v1/admin/orders/{orderId}/zipnova-shipment")).GetProperty("status").GetString());

        // Array suelto.
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Base}/shipments/778899/tracking",
            new[] { new { status = "delivered", status_name = "Entregado", created_at = "2026-10-13", description = "ok" } });
        Assert.Single((await merchant.GetAsync($"/api/v1/admin/orders/{orderId}/zipnova-tracking")).GetProperty("events").EnumerateArray());

        // Zipnova limitando tráfico.
        _factory.ExternalHttp.On(HttpMethod.Get, $"{Base}/shipments/778899/tracking", (_, _) => new HttpResponseMessage(HttpStatusCode.TooManyRequests));
        var limited = await merchant.SendAsync(HttpMethod.Get, $"/api/v1/admin/orders/{orderId}/zipnova-tracking");
        Assert.Equal(HttpStatusCode.BadRequest, limited.StatusCode);
        Assert.Contains("limitando", await limited.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Sin_configurar_o_con_Zipnova_caido()
    {
        var merchant = await Merchant.CreateAsync(_factory, "zie");
        var orderId = await merchant.CreateSaleAsync();

        Assert.Equal(HttpStatusCode.BadRequest,
            (await merchant.SendAsync(HttpMethod.Post, "/api/v1/admin/shipping/zipnova/test", new { })).StatusCode);
        Assert.False((await merchant.PostAsync("/api/v1/shipping/zipnova/quote", new { postalCode = "1043", city = "x", state = "y", units = 1 }))
            .GetProperty("available").GetBoolean());
        Assert.Equal(HttpStatusCode.BadRequest,
            (await merchant.SendAsync(HttpMethod.Post, $"/api/v1/admin/orders/{orderId}/zipnova-shipment", Recipient())).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await merchant.SendAsync(HttpMethod.Get, $"/api/v1/admin/orders/{orderId}/zipnova-label")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await merchant.SendAsync(HttpMethod.Get, $"/api/v1/admin/orders/{orderId}/zipnova-tracking")).StatusCode);

        await merchant.PutAsync("/api/v1/admin/shipping/zipnova", Config());
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Base}/shipments/quote", new { message = "cuenta suspendida" }, HttpStatusCode.Forbidden);

        var quote = await merchant.PostAsync("/api/v1/shipping/zipnova/quote", new { postalCode = "1043", city = "CABA", state = "BA", units = 1 });
        Assert.Empty(quote.GetProperty("options").EnumerateArray());
        Assert.False(string.IsNullOrEmpty(quote.GetProperty("error").GetString()));

        var test = await merchant.SendAsync(HttpMethod.Post, "/api/v1/admin/shipping/zipnova/test", new { });
        Assert.Contains("cuenta suspendida", await test.Content.ReadAsStringAsync());

        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Base}/shipments", new { error = "destino inválido" }, HttpStatusCode.UnprocessableEntity);
        var create = await merchant.SendAsync(HttpMethod.Post, $"/api/v1/admin/orders/{orderId}/zipnova-shipment", Recipient());
        Assert.Equal(HttpStatusCode.BadRequest, create.StatusCode);
        Assert.Contains("destino inválido", await create.Content.ReadAsStringAsync());

        await merchant.ExpectOkAsync(HttpMethod.Delete, "/api/v1/admin/shipping/zipnova");
        await merchant.ExpectOkAsync(HttpMethod.Delete, "/api/v1/admin/shipping/zipnova");
    }

    private static HttpResponseMessage Created(long id) => FakeHttp.Json(new
    {
        id,
        external_id = "TF-x",
        carrier_tracking_id = $"AND{id}",
        carrier = new { id = 12, name = "Andreani" },
        status = "new",
        tracking = $"https://tracking.zipnova.com.ar/{id}",
    });

    private async Task<(Merchant Merchant, Guid OrderId)> ConfiguredSaleAsync(string tag)
    {
        var merchant = await Merchant.CreateAsync(_factory, tag);
        await merchant.PutAsync("/api/v1/admin/shipping/zipnova", Config());
        return (merchant, await merchant.CreateSaleAsync());
    }

    [Fact]
    public async Task Dos_pedidos_a_la_vez_crean_un_solo_envio()
    {
        // Zipnova no deduplica: un segundo POST /shipments es otro envío que se paga.
        var (merchant, orderId) = await ConfiguredSaleAsync("zpr");
        var url = $"/api/v1/admin/orders/{orderId}/zipnova-shipment";
        var shipments = $"{Base}/shipments";
        var before = _factory.ExternalHttp.SentTo(shipments).Count;

        var (first, second) = await CarrierRace.RunAsync(_factory.ExternalHttp, HttpMethod.Post, shipments,
            () => Created(8800001), () => merchant.SendAsync(HttpMethod.Post, url, Recipient()));

        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
        Assert.Contains("envío en curso", await second.Content.ReadAsStringAsync());
        Assert.Equal(before + 1, _factory.ExternalHttp.SentTo(shipments).Count);

        var again = await merchant.PostAsync(url, Recipient());
        Assert.True(again.GetProperty("alreadyExisted").GetBoolean());
        Assert.Equal(8800001, again.GetProperty("shipmentId").GetInt64());
        Assert.Equal(before + 1, _factory.ExternalHttp.SentTo(shipments).Count);
    }

    [Fact]
    public async Task Si_Zipnova_no_responde_se_avisa_y_se_puede_reintentar()
    {
        var (merchant, orderId) = await ConfiguredSaleAsync("zpt");
        var url = $"/api/v1/admin/orders/{orderId}/zipnova-shipment";

        _factory.ExternalHttp.On(HttpMethod.Post, $"{Base}/shipments", (_, _) => throw new HttpRequestException("conexión cortada"));
        var noAnswer = await merchant.SendAsync(HttpMethod.Post, url, Recipient());
        Assert.Equal(HttpStatusCode.BadGateway, noAnswer.StatusCode);
        Assert.Contains("revisalo en el panel de Zipnova", await noAnswer.Content.ReadAsStringAsync());

        _factory.ExternalHttp.On(HttpMethod.Post, $"{Base}/shipments", (_, _) => Created(8800002));
        var created = await merchant.PostAsync(url, Recipient());
        Assert.False(created.GetProperty("alreadyExisted").GetBoolean());
    }

    [Fact]
    public async Task El_estado_guardado_es_el_del_evento_mas_nuevo_aunque_lleguen_al_reves()
    {
        var (merchant, orderId) = await ConfiguredSaleAsync("zpk");
        _factory.ExternalHttp.On(HttpMethod.Post, $"{Base}/shipments", (_, _) => Created(8800003));
        await merchant.PostAsync($"/api/v1/admin/orders/{orderId}/zipnova-shipment", Recipient());

        // Del más viejo al más nuevo: tomar el primero dejaría "new" para
        // siempre aunque el paquete ya se haya entregado.
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Base}/shipments/8800003/tracking", new
        {
            data = new[]
            {
                new { status = "new", status_name = "Nuevo", created_at = "2026-10-01 10:00:00", description = "" },
                new { status = "in_transit", status_name = "En camino", created_at = "2026-10-02 09:00:00", description = "" },
                new { status = "delivered", status_name = "Entregado", created_at = "2026-10-03 15:30:00", description = "" },
            },
        });

        var tracking = await merchant.GetAsync($"/api/v1/admin/orders/{orderId}/zipnova-tracking");
        Assert.Equal("delivered", tracking.GetProperty("events")[0].GetProperty("status").GetString());
        Assert.Equal("delivered",
            (await merchant.GetAsync($"/api/v1/admin/orders/{orderId}/zipnova-shipment")).GetProperty("status").GetString());
    }

    private static async Task<byte[]> LabelAsync(Merchant merchant, Guid orderId)
    {
        var res = await merchant.ExpectOkAsync(HttpMethod.Get, $"/api/v1/admin/orders/{orderId}/zipnova-label");
        Assert.Equal("application/pdf", res.Content.Headers.ContentType?.MediaType);
        return await res.Content.ReadAsByteArrayAsync();
    }

    [Fact]
    public async Task Un_envio_a_revisar_que_no_se_creo_se_libera_y_se_vuelve_a_crear()
    {
        var (merchant, orderId) = await ConfiguredSaleAsync("zpv");
        var url = $"/api/v1/admin/orders/{orderId}/zipnova-shipment";
        var shipments = $"{Base}/shipments";

        // Sin nada a revisar, liberar es un 409 y la venta no muestra aviso.
        Assert.Equal(HttpStatusCode.Conflict, (await merchant.SendAsync(HttpMethod.Post, $"{url}/review/release")).StatusCode);
        Assert.Equal(System.Text.Json.JsonValueKind.Null,
            (await merchant.GetAsync(url)).GetProperty("review").ValueKind);

        await StuckShipment.LeaveAsync(_factory, merchant.TenantId, orderId, ShipmentCarriers.Zipnova, "envío #8800009");
        var state = await merchant.GetAsync(url);
        Assert.Equal("envío #8800009", state.GetProperty("review").GetProperty("note").GetString());
        Assert.Equal(HttpStatusCode.Conflict, (await merchant.SendAsync(HttpMethod.Post, url, Recipient())).StatusCode);

        // Liberarlo pide el permiso de despachar.
        var catalog = await merchant.AddTeammateAsync("catalogo", "zpveq");
        Assert.Equal(HttpStatusCode.Forbidden, await catalog.StatusAsync(HttpMethod.Post, $"{url}/review/release"));

        // El número de envío de Zipnova es numérico.
        Assert.Equal(HttpStatusCode.BadRequest,
            (await merchant.SendAsync(HttpMethod.Post, $"{url}/review/record", new { number = "OCA123" })).StatusCode);

        // "No se creó": se suelta, una sola vez, y se puede crear de nuevo.
        Assert.Equal(HttpStatusCode.NoContent, (await merchant.SendAsync(HttpMethod.Post, $"{url}/review/release")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await merchant.SendAsync(HttpMethod.Post, $"{url}/review/release")).StatusCode);
        Assert.Equal(System.Text.Json.JsonValueKind.Null,
            (await merchant.GetAsync(url)).GetProperty("review").ValueKind);

        _factory.ExternalHttp.On(HttpMethod.Post, shipments, (_, _) => Created(8800010));
        var created = await merchant.PostAsync(url, Recipient());
        Assert.False(created.GetProperty("alreadyExisted").GetBoolean());
        Assert.Equal(8800010, created.GetProperty("shipmentId").GetInt64());

        var activity = await merchant.GetAsync("/api/v1/members/activity");
        Assert.Contains(activity.GetProperty("items").EnumerateArray(), e =>
            e.GetProperty("action").GetString() == "shipment.review.release");
    }

    [Fact]
    public async Task Un_envio_a_revisar_que_si_se_creo_se_carga_con_su_numero()
    {
        var (merchant, orderId) = await ConfiguredSaleAsync("zpw");
        var url = $"/api/v1/admin/orders/{orderId}/zipnova-shipment";
        await StuckShipment.LeaveAsync(_factory, merchant.TenantId, orderId, ShipmentCarriers.Zipnova, "envío #8800011");

        var recorded = await merchant.PostAsync($"{url}/review/record", new { number = "#8800011" });
        Assert.Equal(8800011, recorded.GetProperty("shipmentId").GetInt64());
        Assert.True((await merchant.GetAsync(url)).GetProperty("exists").GetBoolean());

        // La etiqueta sale con el número cargado, como la de uno creado acá.
        _factory.ExternalHttp.On(HttpMethod.Get, $"{Base}/shipments/8800011/label.pdf", (_, _) =>
            new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent("%PDF-1.4"u8.ToArray()) });
        Assert.Equal(HttpStatusCode.OK,
            (await merchant.SendAsync(HttpMethod.Get, $"/api/v1/admin/orders/{orderId}/zipnova-label")).StatusCode);

        Assert.Equal(HttpStatusCode.Conflict,
            (await merchant.SendAsync(HttpMethod.Post, $"{url}/review/record", new { number = "8800011" })).StatusCode);
    }
}
