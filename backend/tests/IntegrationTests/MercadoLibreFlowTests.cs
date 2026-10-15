using System.Net;
using System.Text.Json;
using System.Web;
using Api.Meli;
using Microsoft.AspNetCore.Mvc.Testing;

namespace IntegrationTests;

/// <summary>
/// Mercado Libre con una cuenta real (contra la API simulada en
/// <see cref="FakeHttp"/>), no la de demostración: conectar por OAuth → traer
/// las ventas → el aviso de una venta nueva descuenta stock → la cancelación
/// lo devuelve → el stock y el precio locales viajan a ML → preguntas,
/// mensajes, reclamos y publicar.
///
/// <para>
/// El stock unificado es lo que vende la integración: una venta en ML que no
/// descuenta, o una cancelación que no devuelve, es mercadería que se vende
/// dos veces o que desaparece. Por eso se mira el disponible en cada paso.
/// </para>
/// </summary>
[Collection("api")]
public sealed class MercadoLibreFlowTests
{
    private const string Api = "https://api.mercadolibre.com";
    private readonly ApiFactory _factory;

    public MercadoLibreFlowTests(ApiFactory factory) => _factory = factory;

    private static object Order(long id, string status, string itemId, int quantity, long buyerId = 777) => new
    {
        id,
        status,
        date_created = "2026-10-10T12:00:00.000-03:00",
        total_amount = 15_000m * quantity,
        paid_amount = 15_000m * quantity,
        currency_id = "ARS",
        pack_id = id + 1,
        buyer = new { id = buyerId, nickname = "COMPRADOR_ML" },
        shipping = new { id = 4_000_000_001L },
        order_items = new[]
        {
            new { item = new { id = itemId, title = "Remera ML", seller_sku = "REM-1" }, quantity, unit_price = 15_000m, sale_fee = 1_950m },
        },
    };

    private void StubTokens(long userId, int expiresIn = 21_600) =>
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Api}/oauth/token", new
        {
            access_token = "APP_USR-meli",
            refresh_token = "TG-meli",
            user_id = userId,
            expires_in = expiresIn,
        });

    [Fact]
    public async Task Conectar_vender_cancelar_y_sincronizar()
    {
        var merchant = await Merchant.CreateAsync(_factory, "ml");
        var userId = Random.Shared.NextInt64(100_000_000, 900_000_000);
        var itemId = $"MLA{Random.Shared.NextInt64(1_000_000_000, 9_000_000_000)}";

        // Sin conectar: las lecturas en vivo vuelven vacías y las acciones piden conectar.
        Assert.Equal(0, (await merchant.GetAsync("/api/v1/admin/meli/questions")).GetProperty("total").GetInt32());
        Assert.Empty((await merchant.GetAsync("/api/v1/admin/meli/claims")).GetProperty("claims").EnumerateArray());
        Assert.Empty((await merchant.GetAsync("/api/v1/admin/meli/items")).GetProperty("items").EnumerateArray());
        Assert.Equal(HttpStatusCode.Conflict,
            (await merchant.SendAsync(HttpMethod.Put, "/api/v1/admin/meli/settings", new { stockSyncEnabled = true })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await merchant.SendAsync(HttpMethod.Post, "/api/v1/admin/meli/orders/refresh")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await merchant.SendAsync(HttpMethod.Get, "/api/v1/admin/meli/categories/predict?title=remera")).StatusCode);

        // 1. OAuth: el primer token vence enseguida, así que el backfill ya
        //    ejercita la renovación.
        var connect = await merchant.PostAsync("/api/v1/admin/meli/connect", new { });
        var state = HttpUtility.ParseQueryString(new Uri(connect.GetProperty("authUrl").GetString()!).Query)["state"]!;
        StubTokens(userId, expiresIn: 60);
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/users/me", new { id = userId, nickname = "TIENDA_ML", site_id = "MLA" });
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/orders/search", new
        {
            results = new[] { Order(userId * 10 + 1, "paid", itemId, 1) },
        });

        var browser = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var callback = await browser.GetAsync($"/api/v1/meli/oauth/callback?code=TG-code&state={Uri.EscapeDataString(state)}");
        Assert.EndsWith("meli=connected", callback.Headers.Location!.ToString());
        StubTokens(userId);

        var connection = await merchant.GetAsync("/api/v1/admin/meli/connection");
        Assert.True(connection.GetProperty("connected").GetBoolean());
        Assert.False(connection.GetProperty("isDemo").GetBoolean());
        Assert.Equal("TIENDA_ML", connection.GetProperty("nickname").GetString());
        Assert.Equal(1, connection.GetProperty("ordersImported").GetInt32());
        Assert.Contains(_factory.ExternalHttp.SentTo($"{Api}/oauth/token"), r => r.Body!.Contains("grant_type=refresh_token"));

        // 2. Vincular la publicación con una variante local de 10 unidades.
        var (productId, variantId) = await merchant.CreateProductAsync("Remera ML", priceMinor: 12_000_00, stock: 10);
        await merchant.PostAsync($"/api/v1/admin/meli/items/{itemId.ToLowerInvariant()}/link",
            new { productId, variantId, meliVariationId = (long?)null, title = "Remera ML" });
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post,
            $"/api/v1/admin/meli/items/{itemId}/link", new { productId = Guid.NewGuid(), variantId = Guid.NewGuid() })).StatusCode);

        // 3. Llega el aviso de una venta nueva: el worker la trae y descuenta.
        var saleId = userId * 10 + 2;
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/orders/{saleId}", Order(saleId, "paid", itemId, 3));
        await NotifyAsync(userId, $"/orders/{saleId}");
        await Workers.RunOnceAsync<MeliNotificationWorker>(_factory);
        Assert.Equal(7, await merchant.AvailableAsync(variantId));

        // El mismo aviso otra vez no vuelve a descontar.
        await NotifyAsync(userId, $"/orders/{saleId}");
        await Workers.RunOnceAsync<MeliNotificationWorker>(_factory);
        Assert.Equal(7, await merchant.AvailableAsync(variantId));

        // 4. La venta se cancela: el stock vuelve.
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/orders/{saleId}", Order(saleId, "cancelled", itemId, 3));
        await NotifyAsync(userId, $"/orders/{saleId}");
        await Workers.RunOnceAsync<MeliNotificationWorker>(_factory);
        Assert.Equal(10, await merchant.AvailableAsync(variantId));

        var orders = await merchant.GetAsync("/api/v1/admin/meli/orders?limit=10");
        Assert.Equal(2, orders.GetProperty("total").GetInt32());
        var stats = await merchant.GetAsync("/api/v1/admin/meli/stats?days=30");
        Assert.True(stats.GetProperty("connected").GetBoolean());

        // 5. Sincronizar stock (con colchón) y precio (con recargo) hacia ML.
        var settings = await merchant.PutAsync("/api/v1/admin/meli/settings", new
        {
            stockSyncEnabled = true,
            stockBufferUnits = 2,
            autoInvoiceEnabled = false,
            priceSyncEnabled = true,
            priceMarkupPct = 10m,
        });
        Assert.Equal(2, settings.GetProperty("stockBufferUnits").GetInt32());
        _factory.ExternalHttp.OnJson(HttpMethod.Put, $"{Api}/items/{itemId}", new { id = itemId });
        await Workers.RunOnceAsync<MeliStockSyncWorker>(_factory);
        var put = _factory.ExternalHttp.SentTo($"{Api}/items/{itemId}").Last(r => r.Method == HttpMethod.Put);
        Assert.Contains("\"available_quantity\":8", put.Body); // 10 − 2 de colchón
        Assert.Contains("\"price\":13200", put.Body);          // 12.000 + 10 %

        // Sin cambios no se vuelve a empujar.
        var pushes = _factory.ExternalHttp.SentTo($"{Api}/items/{itemId}").Count;
        await Workers.RunOnceAsync<MeliStockSyncWorker>(_factory);
        Assert.Equal(pushes, _factory.ExternalHttp.SentTo($"{Api}/items/{itemId}").Count);

        // 6. Refrescar ventas a mano.
        var refreshed = await merchant.PostAsync("/api/v1/admin/meli/orders/refresh", new { });
        Assert.False(refreshed.GetProperty("demo").GetBoolean());

        // 7. Desvincular y desconectar.
        await merchant.ExpectOkAsync(HttpMethod.Delete, $"/api/v1/admin/meli/items/{itemId}/link");
        await merchant.ExpectOkAsync(HttpMethod.Delete, $"/api/v1/admin/meli/items/{itemId}/link");
        await merchant.ExpectOkAsync(HttpMethod.Delete, "/api/v1/admin/meli/connection");
        await merchant.ExpectOkAsync(HttpMethod.Delete, "/api/v1/admin/meli/connection");
    }

    [Fact]
    public async Task Preguntas_mensajes_reclamos_publicaciones_y_publicar()
    {
        var (merchant, userId) = await ConnectedAsync("mlq");

        // Preguntas en vivo y responder.
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/questions/search", new
        {
            total = 1,
            questions = new[]
            {
                new { id = 123L, text = "¿Tenés talle L?", status = "UNANSWERED", item_id = "MLA1", date_created = "2026-10-10",
                      answer = (object?)new { text = "Sí", date_created = "2026-10-10" } },
            },
        });
        // Sin la ficha de la publicación (ML no contesta el multiget), la pregunta sale igual.
        var questions = await merchant.GetAsync("/api/v1/admin/meli/questions?status=UNANSWERED");
        Assert.Equal(1, questions.GetProperty("total").GetInt32());
        Assert.Contains("status=UNANSWERED", _factory.ExternalHttp.SentTo($"{Api}/questions/search").Last().Uri.Query);
        Assert.Equal(JsonValueKind.Null, questions.GetProperty("questions")[0].GetProperty("item").ValueKind);

        // Con la ficha: título, foto (en https), precio y stock al lado de la pregunta.
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/items?ids=MLA1", new object[]
        {
            new { code = 200, body = new { id = "MLA1", title = "Remera lisa", thumbnail = "http://http2.mlstatic.com/remera.jpg", price = 15000m, currency_id = "ARS", available_quantity = 4 } },
        });
        var withItem = (await merchant.GetAsync("/api/v1/admin/meli/questions?status=UNANSWERED")).GetProperty("questions")[0].GetProperty("item");
        Assert.Equal("Remera lisa", withItem.GetProperty("title").GetString());
        Assert.Equal("https://http2.mlstatic.com/remera.jpg", withItem.GetProperty("thumbnail").GetString());
        Assert.Equal(4, withItem.GetProperty("availableQuantity").GetInt32());
        Assert.Equal(1, (await merchant.GetAsync("/api/v1/home/todo")).GetProperty("mercadoLibre").GetProperty("unanswered").GetInt32());

        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post,
            "/api/v1/admin/meli/questions/123/answer", new { text = " " })).StatusCode);
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Api}/answers", new { id = 123 });
        await merchant.ExpectOkAsync(HttpMethod.Post, "/api/v1/admin/meli/questions/123/answer", new { text = "Sí, hay talle L." });

        // Mensajes del pack: leer y mandar (solo a una venta conocida).
        var packId = Random.Shared.NextInt64(2_000_000_000_000, 3_000_000_000_000);
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/messages/packs/{packId}", new
        {
            messages = new object[]
            {
                new { text = "Hola", message_date = new { created = "2026-10-10T10:00:00Z" }, from = new { user_id = userId.ToString() } },
                new { text = "¿Cuándo llega?", message_date = "2026-10-10T11:00:00Z", from = new { user_id = "555" } },
            },
        });
        var messages = await merchant.GetAsync($"/api/v1/admin/meli/packs/{packId}/messages");
        Assert.True(messages.GetProperty("messages")[0].GetProperty("fromSeller").GetBoolean());

        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post,
            $"/api/v1/admin/meli/packs/{packId}/messages", new { text = new string('x', 351) })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post,
            $"/api/v1/admin/meli/packs/{packId}/messages", new { text = "Hola" })).StatusCode); // venta desconocida

        // Con la venta en el cache, el mensaje sale al comprador de ESA venta.
        var saleId = packId - 1;
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/orders/{saleId}", Order(saleId, "paid", "MLA9", 1, buyerId: 4242));
        await NotifyAsync(userId, $"/orders/{saleId}");
        await Workers.RunOnceAsync<MeliNotificationWorker>(_factory);
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Api}/messages/packs/{packId}", new { id = "m1" });
        await merchant.ExpectOkAsync(HttpMethod.Post, $"/api/v1/admin/meli/packs/{packId}/messages", new { text = "Sale mañana." });
        Assert.Contains("\"user_id\":\"4242\"", _factory.ExternalHttp.SentTo($"{Api}/messages/packs/{packId}").Last().Body);

        // Reclamos: con datos, y con el recurso caído (sin reclamos ≠ error).
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/post-purchase/v1/claims/search", new
        {
            data = new[] { new { id = 5001L, status = "opened", stage = "claim", reason_id = "PDD", resource_id = 2000L, date_created = "2026-10-10" } },
            paging = new { total = 31, offset = 30, limit = 30 },
        });
        var claims = await merchant.GetAsync("/api/v1/admin/meli/claims?offset=30&limit=30");
        Assert.Single(claims.GetProperty("claims").EnumerateArray());
        // El total es el de ML, no el de la página; y la página se le pide a ML.
        Assert.Equal(31, claims.GetProperty("total").GetInt32());
        Assert.Contains("offset=30&limit=30", _factory.ExternalHttp.SentTo($"{Api}/post-purchase/v1/claims/search").Last().Uri.Query);
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/post-purchase/v1/claims/search", new { message = "not found" }, HttpStatusCode.NotFound);
        Assert.Empty((await merchant.GetAsync("/api/v1/admin/meli/claims")).GetProperty("claims").EnumerateArray());

        // Publicaciones del vendedor (multiget) con su vínculo.
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/users/{userId}/items/search",
            new { results = new[] { "MLA1", "MLA2" }, paging = new { total = 57 } });
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/items?ids=", new object[]
        {
            new { code = 200, body = new { id = "MLA1", title = "Remera", status = "active", price = 15000m, available_quantity = 4 } },
            new { code = 404 },
        });
        var items = await merchant.GetAsync("/api/v1/admin/meli/items?limit=1000");
        Assert.Single(items.GetProperty("items").EnumerateArray());
        Assert.Equal(57, items.GetProperty("total").GetInt32());
        // ML no da más de 50 por búsqueda: el límite se recorta antes de pedir.
        Assert.Contains("limit=50", _factory.ExternalHttp.SentTo($"{Api}/users/{userId}/items/search").Last().Uri.Query);

        // Categoría sugerida y publicar.
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/sites/MLA/domain_discovery/search",
            new[] { new { category_id = "MLA109027", category_name = "Remeras", domain_name = "Remeras" } });
        var predict = await merchant.GetAsync("/api/v1/admin/meli/categories/predict?title=remera%20azul");
        Assert.Equal("MLA109027", predict.GetProperty("suggestions")[0].GetProperty("categoryId").GetString());

        var (productId, _) = await merchant.CreateProductAsync("Remera para publicar", priceMinor: 9_900_00, stock: 5, sku: $"PUB-{userId}");
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post,
            $"/api/v1/admin/meli/products/{productId}/publish", new { categoryId = "" })).StatusCode);

        // Con recargo para ML: la publicación nace con el precio del canal, el
        // mismo que después empuja la sincronización (antes salía al de la tienda).
        await merchant.PutAsync("/api/v1/admin/meli/settings", new { stockSyncEnabled = false, priceSyncEnabled = true, priceMarkupPct = 10m });
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Api}/items", new { id = "MLA555", permalink = "https://articulo.mercadolibre.com.ar/MLA-555" });
        var published = await merchant.PostAsync($"/api/v1/admin/meli/products/{productId}/publish", new { categoryId = "MLA109027" });
        Assert.Equal("MLA555", published.GetProperty("itemId").GetString());
        var item = _factory.ExternalHttp.SentTo($"{Api}/items").Last(r => r.Uri.AbsolutePath == "/items");
        Assert.Contains("\"price\":10890", item.Body); // 9.900 + 10 %
        Assert.Contains("SELLER_SKU", item.Body);
        // La publicación nace vinculada y con el precio ya empujado: la
        // sincronización no la vuelve a PUTear.
        Assert.Equal(1, (await merchant.GetAsync("/api/v1/admin/meli/connection")).GetProperty("linkedItems").GetInt32());
        await Workers.RunOnceAsync<MeliStockSyncWorker>(_factory);
        Assert.DoesNotContain(_factory.ExternalHttp.SentTo($"{Api}/items/MLA555"), r => r.Method == HttpMethod.Put);

        // Errores de ML llegan traducidos.
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Api}/answers", new { message = "question already answered" }, HttpStatusCode.BadRequest);
        var answered = await merchant.SendAsync(HttpMethod.Post, "/api/v1/admin/meli/questions/123/answer", new { text = "otra" });
        Assert.Equal(HttpStatusCode.BadRequest, answered.StatusCode);
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/questions/search", new { message = "forbidden" }, HttpStatusCode.Forbidden);
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Get, "/api/v1/admin/meli/questions")).StatusCode);
    }

    [Fact]
    public async Task Stock_y_precio_se_sincronizan_cada_uno_por_su_lado()
    {
        var (merchant, _) = await ConnectedAsync("mlp");
        var itemId = $"MLA{Random.Shared.NextInt64(1_000_000_000, 9_000_000_000)}";
        var (productId, variantId) = await merchant.CreateProductAsync("Buzo ML", priceMinor: 20_000_00, stock: 6);
        await merchant.PostAsync($"/api/v1/admin/meli/items/{itemId}/link",
            new { productId, variantId, meliVariationId = (long?)null, title = "Buzo ML" });
        _factory.ExternalHttp.OnJson(HttpMethod.Put, $"{Api}/items/{itemId}", new { id = itemId });
        List<string?> Puts() => [.. _factory.ExternalHttp.SentTo($"{Api}/items/{itemId}")
            .Where(r => r.Method == HttpMethod.Put).Select(r => r.Body)];

        // Solo stock: viaja la cantidad y el precio no, aunque nunca se haya empujado.
        await merchant.PutAsync("/api/v1/admin/meli/settings", new { stockSyncEnabled = true, priceSyncEnabled = false });
        await Workers.RunOnceAsync<MeliStockSyncWorker>(_factory);
        var stockOnly = Assert.Single(Puts());
        Assert.Contains("\"available_quantity\":6", stockOnly);
        Assert.DoesNotContain("price", stockOnly);

        // Solo precio, con el stock apagado: antes la pasada ni miraba la tienda.
        // El stock cambia en el medio y aun así no viaja.
        await merchant.ExpectOkAsync(HttpMethod.Put, $"/api/v1/inventory/{variantId}", new { available = 4, reason = "test" });
        await merchant.PutAsync("/api/v1/admin/meli/settings", new { stockSyncEnabled = false, priceSyncEnabled = true, priceMarkupPct = 0m });
        await Workers.RunOnceAsync<MeliStockSyncWorker>(_factory);
        var priceOnly = Puts().Last();
        Assert.Equal(2, Puts().Count);
        Assert.Contains("\"price\":20000", priceOnly);
        Assert.DoesNotContain("available_quantity", priceOnly);

        // Los dos apagados: nada sale.
        await merchant.PutAsync("/api/v1/admin/meli/settings", new { stockSyncEnabled = false, priceSyncEnabled = false });
        await Workers.RunOnceAsync<MeliStockSyncWorker>(_factory);
        Assert.Equal(2, Puts().Count);
    }

    [Fact]
    public async Task La_cuenta_de_demostracion_es_de_solo_lectura()
    {
        var store = await SeededStore.GetAsync(_factory);

        Assert.Equal(HttpStatusCode.Conflict, (await store.SendAsync(HttpMethod.Post,
            "/api/v1/admin/meli/questions/1/answer", new { text = "hola" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await store.SendAsync(HttpMethod.Post,
            "/api/v1/admin/meli/packs/1/messages", new { text = "hola" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await store.SendAsync(HttpMethod.Post,
            $"/api/v1/admin/meli/products/{Guid.NewGuid()}/publish", new { categoryId = "MLA1" })).StatusCode);
        Assert.True((await store.PostAsync("/api/v1/admin/meli/orders/refresh", new { })).GetProperty("demo").GetBoolean());

        // Las lecturas sí: vienen del ejemplo.
        Assert.NotEmpty((await store.GetAsync("/api/v1/admin/meli/packs/1/messages")).GetProperty("messages").EnumerateArray());
        Assert.NotEmpty((await store.GetAsync("/api/v1/admin/meli/questions")).GetProperty("questions").EnumerateArray());
    }

    [Fact]
    public async Task Avisos_raros_y_OAuth_fallido()
    {
        // El webhook acepta cualquier cosa (ML reintenta si no hay 200) pero solo guarda lo útil.
        var client = _factory.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/v1/webhooks/meli", new { topic = "", resource = "", user_id = 0 })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/v1/webhooks/meli",
            new { topic = "questions", resource = "/questions/1", user_id = 1 })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/v1/webhooks/meli",
            new { topic = "orders_v2", resource = "/orders/no-es-un-numero", user_id = 1 })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/v1/webhooks/meli",
            new { topic = "orders_v2", resource = "/orders/123", user_id = 1 })).StatusCode); // cuenta de nadie
        await Workers.RunOnceAsync<MeliNotificationWorker>(_factory);

        var browser = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        Assert.EndsWith("meli=error", (await browser.GetAsync("/api/v1/meli/oauth/callback")).Headers.Location!.ToString());
        Assert.EndsWith("meli=error", (await browser.GetAsync("/api/v1/meli/oauth/callback?code=x&state=trucho")).Headers.Location!.ToString());

        var merchant = await Merchant.CreateAsync(_factory, "mle");
        var connect = await merchant.PostAsync("/api/v1/admin/meli/connect", new { });
        var state = HttpUtility.ParseQueryString(new Uri(connect.GetProperty("authUrl").GetString()!).Query)["state"]!;
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Api}/oauth/token", new { message = "invalid_grant" }, HttpStatusCode.BadRequest);
        Assert.EndsWith("meli=error", (await browser.GetAsync(
            $"/api/v1/meli/oauth/callback?code=x&state={Uri.EscapeDataString(state)}")).Headers.Location!.ToString());
    }

    // ---------------------------------------------------------------- helpers

    [Fact]
    public async Task Facturar_una_venta_de_Mercado_Libre()
    {
        var (merchant, userId) = await ConnectedAsync("mlf");
        var itemId = $"MLA{Random.Shared.NextInt64(1_000_000_000, 9_000_000_000)}";
        async Task<long> SaleAsync(long id, string status, int quantity)
        {
            _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/orders/{id}", Order(id, status, itemId, quantity));
            await NotifyAsync(userId, $"/orders/{id}");
            await Workers.RunOnceAsync<MeliNotificationWorker>(_factory);
            return id;
        }
        var paid = await SaleAsync(userId * 10 + 5, "paid", 2);
        var unpaid = await SaleAsync(userId * 10 + 6, "payment_required", 1);
        var free = await SaleAsync(userId * 10 + 7, "paid", 0);
        Task<HttpResponseMessage> Invoice(long id) => merchant.SendAsync(HttpMethod.Post, $"/api/v1/admin/meli/orders/{id}/invoice");

        Assert.Equal(HttpStatusCode.NotFound, (await Invoice(1)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Invoice(unpaid)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Invoice(free)).StatusCode);
        // Sin la facturación configurada, ARCA ni se llama.
        Assert.False((await Invoice(paid)).IsSuccessStatusCode);

        var arca = new FakeArca(_factory.ExternalHttp);
        await merchant.ConfigureFiscalAsync();

        // ARCA rechaza: el motivo llega explicado y la venta queda sin facturar.
        arca.RejectNext = true;
        var rejected = await Invoice(paid);
        Assert.Equal(HttpStatusCode.BadRequest, rejected.StatusCode);
        Assert.Contains("10015", await rejected.Content.ReadAsStringAsync());

        // Antes de facturar: una sin facturar (la de importe cero no cuenta),
        // con el mismo número en el filtro de la pestaña y en el Inicio.
        Task<long[]> ListAsync(string query) => merchant.GetAsync($"/api/v1/admin/meli/orders?limit=25&{query}")
            .ContinueWith(t => t.Result.GetProperty("items").EnumerateArray().Select(o => o.GetProperty("meliOrderId").GetInt64()).ToArray());
        Assert.Equal([paid], await ListAsync("estado=sin-facturar"));
        Assert.Equal(1, (await merchant.GetAsync("/api/v1/home/todo")).GetProperty("mercadoLibre").GetProperty("unbilled").GetInt32());
        Assert.Equal([unpaid], await ListAsync("estado=pendientes"));
        // Búsqueda por comprador, por número de venta y por producto.
        Assert.Equal(3, (await ListAsync("q=comprador_ml")).Length);
        Assert.Equal([paid], await ListAsync($"q={paid}"));
        Assert.Equal(3, (await ListAsync("q=remera")).Length);
        Assert.Empty(await ListAsync("q=heladera"));

        // Autoriza: vuelve el CAE, y la misma venta no se factura dos veces.
        var invoice = await merchant.PostAsync($"/api/v1/admin/meli/orders/{paid}/invoice", new { });
        Assert.False(string.IsNullOrEmpty(invoice.GetProperty("cae").GetString()));
        Assert.Equal(3, invoice.GetProperty("ptoVta").GetInt32());
        Assert.Equal(HttpStatusCode.Conflict, (await Invoice(paid)).StatusCode);

        Assert.Empty(await ListAsync("estado=sin-facturar"));
        Assert.Equal([paid], await ListAsync("estado=facturadas"));
        Assert.Equal(0, (await merchant.GetAsync("/api/v1/home/todo")).GetProperty("mercadoLibre").GetProperty("unbilled").GetInt32());
    }

    [Fact]
    public async Task Una_venta_con_devolucion_parcial_cuenta_como_cobrada_en_todo_el_panel()
    {
        // La rentabilidad contaba solo "paid" y el resto del panel también
        // "partially_refunded": dos números distintos para las mismas ventas.
        var (merchant, userId) = await ConnectedAsync("mlr");
        var itemId = $"MLA{Random.Shared.NextInt64(1_000_000_000, 9_000_000_000)}";
        foreach (var (id, status) in new[] { (userId * 10 + 1, "paid"), (userId * 10 + 2, "partially_refunded"), (userId * 10 + 3, "cancelled") })
        {
            _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/orders/{id}", Order(id, status, itemId, 1));
            await NotifyAsync(userId, $"/orders/{id}");
            await Workers.RunOnceAsync<MeliNotificationWorker>(_factory);
        }

        // Las ventas de Order() son del 10-oct-2026: rango fijo para que el test no venza.
        var profitability = await merchant.GetAsync("/api/v1/stats/profitability?from=2026-10-01&to=2026-10-20");
        Assert.Equal(2, profitability.GetProperty("meli").GetProperty("orders").GetInt32());
        var paid = await merchant.GetAsync($"/api/v1/admin/meli/orders?limit=25&estado={MeliOrderFilters.Paid}");
        Assert.Equal(2, paid.GetProperty("total").GetInt32());
    }

    /// <summary>Un comercio con una cuenta de ML conectada (sin ventas previas).</summary>
    private async Task<(Merchant Merchant, long UserId)> ConnectedAsync(string tag)
    {
        var merchant = await Merchant.CreateAsync(_factory, tag);
        var userId = Random.Shared.NextInt64(100_000_000, 900_000_000);

        var connect = await merchant.PostAsync("/api/v1/admin/meli/connect", new { });
        var state = HttpUtility.ParseQueryString(new Uri(connect.GetProperty("authUrl").GetString()!).Query)["state"]!;
        StubTokens(userId);
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/users/me", new { id = userId, nickname = "TIENDA_ML", site_id = "MLA" });
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/orders/search", new { results = Array.Empty<object>() });

        var browser = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var callback = await browser.GetAsync($"/api/v1/meli/oauth/callback?code=c&state={Uri.EscapeDataString(state)}");
        Assert.EndsWith("meli=connected", callback.Headers.Location!.ToString());
        return (merchant, userId);
    }

    private Task<HttpResponseMessage> NotifyAsync(long userId, string resource) =>
        _factory.CreateClient().PostAsJsonAsync("/api/v1/webhooks/meli",
            new { topic = "orders_v2", resource, user_id = userId, application_id = 1, attempts = 1 });
}
