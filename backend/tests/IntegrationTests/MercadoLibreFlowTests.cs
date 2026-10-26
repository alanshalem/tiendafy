using System.Net;
using System.Text.Json;
using System.Web;
using Api.Fiscal;
using Api.Meli;
using Catalog.Infrastructure;
using Catalog.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

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
    private const string Api = MeliAccount.Api;
    private readonly ApiFactory _factory;

    public MercadoLibreFlowTests(ApiFactory factory) => _factory = factory;

    /// <param name="refunded">
    /// Lo devuelto, como lo informa la API de órdenes de ML: en
    /// <c>payments[].transaction_amount_refunded</c>.
    /// </param>
    private static object Order(long id, string status, string itemId, int quantity, long buyerId = 777,
        decimal? paidAmount = null, decimal refunded = 0m) => new
        {
            id,
            status,
            date_created = "2026-10-10T12:00:00.000-03:00",
            total_amount = 15_000m * quantity,
            paid_amount = paidAmount ?? 15_000m * quantity,
            currency_id = "ARS",
            pack_id = id + 1,
            buyer = new { id = buyerId, nickname = "COMPRADOR_ML" },
            shipping = new { id = 4_000_000_001L },
            order_items = new[]
        {
            new { item = new { id = itemId, title = "Remera ML", seller_sku = "REM-1" }, quantity, unit_price = 15_000m, sale_fee = 1_950m },
        },
            payments = new[]
        {
            new
            {
                id = id + 2,
                order_id = id,
                status = "approved",
                status_detail = "accredited",
                transaction_amount = 15_000m * quantity,
                transaction_amount_refunded = refunded,
                total_paid_amount = 15_000m * quantity,
                currency_id = "ARS",
            },
        },
        };

    private void StubTokens(long userId, int expiresIn = 21_600) => MeliAccount.StubTokens(_factory, userId, expiresIn);

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

        // 3. Con "Sincronizar stock" prendido, llega el aviso de una venta
        //    nueva: el worker la trae y descuenta.
        await merchant.PutAsync("/api/v1/admin/meli/settings", new { stockSyncEnabled = true, priceSyncEnabled = false });
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
        // Sin la ficha de la publicación (ML no contesta /items/bulk), la pregunta sale igual.
        var questions = await merchant.GetAsync("/api/v1/admin/meli/questions?status=UNANSWERED");
        Assert.Equal(1, questions.GetProperty("total").GetInt32());
        Assert.Contains("status=UNANSWERED", _factory.ExternalHttp.SentTo($"{Api}/questions/search").Last().Uri.Query);
        Assert.Equal(JsonValueKind.Null, questions.GetProperty("questions")[0].GetProperty("item").ValueKind);

        // Con la ficha: título, foto (en https), precio y stock al lado de la pregunta.
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/items/bulk?ids=MLA1", new object[]
        {
            new { status_code = 200, id = "MLA1", body = new { id = "MLA1", title = "Remera lisa", thumbnail = "http://http2.mlstatic.com/remera.jpg", price = 15000m, currency_id = "ARS", available_quantity = 4 } },
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

        // Publicaciones del vendedor (/items/bulk) con su vínculo.
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/users/{userId}/items/search",
            new { results = new[] { "MLA1", "MLA2" }, paging = new { total = 57 } });
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/items/bulk?ids=", new object[]
        {
            new { status_code = 200, id = "MLA1", body = new { id = "MLA1", title = "Remera", status = "active", price = 15000m, available_quantity = 4 } },
            new { status_code = 404, id = "MLA2", body = new { message = "Item not found", error = "not_found" } },
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

    /// <summary>
    /// Una venta de ML descuenta stock local solo si el stock de esa
    /// publicación se sincroniza (el interruptor de la cuenta y el de la
    /// publicación, los mismos que deciden si el stock viaja a ML). Apagado,
    /// la venta se registra igual pero no toca el stock, y su cancelación
    /// tampoco: lo que no se descontó no se repone.
    /// </summary>
    [Fact]
    public async Task Con_la_sincronizacion_de_stock_apagada_la_venta_no_toca_el_stock()
    {
        var (merchant, userId) = await ConnectedAsync("mlo");
        var itemId = $"MLA{Random.Shared.NextInt64(1_000_000_000, 9_000_000_000)}";
        var (productId, variantId) = await merchant.CreateProductAsync("Gorro ML", priceMinor: 8_000_00, stock: 10);
        await merchant.PostAsync($"/api/v1/admin/meli/items/{itemId}/link",
            new { productId, variantId, meliVariationId = (long?)null, title = "Gorro ML" });
        async Task SaleAsync(long id, string status, int quantity)
        {
            _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/orders/{id}", Order(id, status, itemId, quantity));
            await NotifyAsync(userId, $"/orders/{id}");
            await Workers.RunOnceAsync<MeliNotificationWorker>(_factory);
        }
        async Task<JsonElement> ListedAsync(long id) =>
            (await merchant.GetAsync("/api/v1/admin/meli/orders?limit=25")).GetProperty("items").EnumerateArray()
                .Single(o => o.GetProperty("meliOrderId").GetInt64() == id);

        // 1. Cuenta con la sincronización apagada (como nace): la venta queda
        //    registrada y cobrada, pero el stock de la tienda no se mueve.
        var off = userId * 10 + 1;
        await SaleAsync(off, "paid", 3);
        Assert.Equal(10, await merchant.AvailableAsync(variantId));
        var listed = await ListedAsync(off);
        Assert.Equal("paid", listed.GetProperty("status").GetString());
        Assert.False(listed.GetProperty("stockDiscounted").GetBoolean());

        // Su cancelación no devuelve nada: no había descontado.
        await SaleAsync(off, "cancelled", 3);
        Assert.Equal(10, await merchant.AvailableAsync(variantId));
        Assert.False((await ListedAsync(off)).GetProperty("stockReturned").GetBoolean());

        // 2. Cuenta prendida pero esta publicación con su stock apagado: tampoco.
        await merchant.PutAsync("/api/v1/admin/meli/settings", new { stockSyncEnabled = true, priceSyncEnabled = false });
        await merchant.PutAsync($"/api/v1/admin/meli/items/{itemId}/sync", new { syncStock = false });
        await SaleAsync(userId * 10 + 2, "paid", 1);
        Assert.Equal(10, await merchant.AvailableAsync(variantId));

        // 3. Los dos prendidos: descuenta.
        await merchant.PutAsync($"/api/v1/admin/meli/items/{itemId}/sync", new { syncStock = true });
        var on = userId * 10 + 3;
        await SaleAsync(on, "paid", 2);
        Assert.Equal(8, await merchant.AvailableAsync(variantId));
        Assert.True((await ListedAsync(on)).GetProperty("stockDiscounted").GetBoolean());

        // Apagar la sincronización después no cambia lo que esa venta se llevó:
        // si se cancela, devuelve lo que descontó.
        await merchant.PutAsync("/api/v1/admin/meli/settings", new { stockSyncEnabled = false });
        await SaleAsync(on, "cancelled", 2);
        Assert.Equal(10, await merchant.AvailableAsync(variantId));
        Assert.True((await ListedAsync(on)).GetProperty("stockReturned").GetBoolean());

        // El aviso repetido no devuelve dos veces.
        await SaleAsync(on, "cancelled", 2);
        Assert.Equal(10, await merchant.AvailableAsync(variantId));
    }

    /// <summary>
    /// Una publicación vinculada a un kit descuenta el kit y sus piezas, como
    /// una venta de la tienda, y la cancelación devuelve las dos cosas.
    /// </summary>
    [Fact]
    public async Task Vender_un_kit_en_ML_descuenta_sus_piezas_y_la_cancelacion_las_devuelve()
    {
        var (merchant, userId) = await ConnectedAsync("mlk");
        var itemId = $"MLA{Random.Shared.NextInt64(1_000_000_000, 9_000_000_000)}";
        var (kitProductId, kitVariantId) = await merchant.CreateProductAsync("Kit ML", priceMinor: 30_000_00, stock: 5);
        var (_, pieceA) = await merchant.CreateProductAsync("Pieza A", priceMinor: 5_000_00, stock: 10);
        var (_, pieceB) = await merchant.CreateProductAsync("Pieza B", priceMinor: 5_000_00, stock: 10);
        using (var scope = _factory.Services.CreateScope())
        {
            var catalog = scope.ServiceProvider.GetRequiredService<CatalogDbContext>();
            catalog.KitComponents.AddRange(
                new KitComponent(merchant.TenantId, kitVariantId, pieceA, 2),
                new KitComponent(merchant.TenantId, kitVariantId, pieceB, 1));
            await catalog.SaveChangesAsync();
        }
        await merchant.PostAsync($"/api/v1/admin/meli/items/{itemId}/link",
            new { productId = kitProductId, variantId = kitVariantId, meliVariationId = (long?)null, title = "Kit ML" });
        await merchant.PutAsync("/api/v1/admin/meli/settings", new { stockSyncEnabled = true, priceSyncEnabled = false });

        var saleId = userId * 10 + 1;
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/orders/{saleId}", Order(saleId, "paid", itemId, 2));
        await NotifyAsync(userId, $"/orders/{saleId}");
        await Workers.RunOnceAsync<MeliNotificationWorker>(_factory);
        Assert.Equal(3, await merchant.AvailableAsync(kitVariantId));
        Assert.Equal(6, await merchant.AvailableAsync(pieceA));
        Assert.Equal(8, await merchant.AvailableAsync(pieceB));

        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/orders/{saleId}", Order(saleId, "cancelled", itemId, 2));
        await NotifyAsync(userId, $"/orders/{saleId}");
        await Workers.RunOnceAsync<MeliNotificationWorker>(_factory);
        Assert.Equal(5, await merchant.AvailableAsync(kitVariantId));
        Assert.Equal(10, await merchant.AvailableAsync(pieceA));
        Assert.Equal(10, await merchant.AvailableAsync(pieceB));
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
    public async Task Publicar_registra_lo_que_viajo_y_respeta_el_colchon()
    {
        var (merchant, _) = await ConnectedAsync("mlb");
        await merchant.PutAsync("/api/v1/admin/meli/settings", new { stockSyncEnabled = true, stockBufferUnits = 2 });
        var itemId = $"MLA{Random.Shared.NextInt64(1_000_000_000, 9_000_000_000)}";
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Api}/items", new { id = itemId, permalink = (string?)null });
        _factory.ExternalHttp.OnJson(HttpMethod.Put, $"{Api}/items/{itemId}", new { id = itemId });

        // 5 disponibles − 2 de colchón: viajan 3, y eso es lo que queda como
        // último empujado. Antes quedaba 5 y la primera pasada del worker
        // mandaba un PUT de más con el 3.
        var (productId, _) = await merchant.CreateProductAsync("Gorra con colchón", priceMinor: 5_000_00, stock: 5);
        await merchant.PostAsync($"/api/v1/admin/meli/products/{productId}/publish", new { categoryId = "MLA1" });
        var body = _factory.ExternalHttp.SentTo($"{Api}/items").Last(r => r.Uri.AbsolutePath == "/items").Body;
        Assert.Contains("\"available_quantity\":3", body);

        Assert.Equal(1, (await merchant.GetAsync("/api/v1/admin/meli/connection")).GetProperty("linkedStock").GetInt32());
        await Workers.RunOnceAsync<MeliStockSyncWorker>(_factory);
        Assert.DoesNotContain(_factory.ExternalHttp.SentTo($"{Api}/items/{itemId}"), r => r.Method == HttpMethod.Put);

        // Con un colchón que se come todo el stock no se publica: antes salía
        // 1 unidad igual, justo la sobreventa que el colchón está para evitar.
        await merchant.PutAsync("/api/v1/admin/meli/settings", new { stockSyncEnabled = true, stockBufferUnits = 5 });
        var publishes = _factory.ExternalHttp.SentTo($"{Api}/items").Count(r => r.Uri.AbsolutePath == "/items");
        var refused = await merchant.SendAsync(HttpMethod.Post,
            $"/api/v1/admin/meli/products/{productId}/publish", new { categoryId = "MLA1" });
        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
        Assert.Contains("colchón", JsonDocument.Parse(await refused.Content.ReadAsStringAsync()).RootElement.GetProperty("detail").GetString());
        Assert.Equal(publishes, _factory.ExternalHttp.SentTo($"{Api}/items").Count(r => r.Uri.AbsolutePath == "/items"));
    }

    [Fact]
    public async Task Cada_publicacion_puede_dejar_afuera_su_stock_o_su_precio()
    {
        var (merchant, _) = await ConnectedAsync("mls");
        var itemId = $"MLA{Random.Shared.NextInt64(1_000_000_000, 9_000_000_000)}";
        var (productId, variantId) = await merchant.CreateProductAsync("Campera ML", priceMinor: 30_000_00, stock: 6);
        await merchant.PostAsync($"/api/v1/admin/meli/items/{itemId}/link",
            new { productId, variantId, meliVariationId = (long?)null, title = "Campera ML" });
        _factory.ExternalHttp.OnJson(HttpMethod.Put, $"{Api}/items/{itemId}", new { id = itemId });
        List<string?> Puts() => [.. _factory.ExternalHttp.SentTo($"{Api}/items/{itemId}")
            .Where(r => r.Method == HttpMethod.Put).Select(r => r.Body)];
        await merchant.PutAsync("/api/v1/admin/meli/settings", new { stockSyncEnabled = true, priceSyncEnabled = true, priceMarkupPct = 0m });

        // Sin el stock de esta publicación: viaja solo el precio.
        var off = await merchant.PutAsync($"/api/v1/admin/meli/items/{itemId.ToLowerInvariant()}/sync", new { syncStock = false });
        Assert.False(off.GetProperty("syncStock").GetBoolean());
        Assert.True(off.GetProperty("syncPrice").GetBoolean());
        Assert.Equal(0, (await merchant.GetAsync("/api/v1/admin/meli/connection")).GetProperty("linkedStock").GetInt32());
        await Workers.RunOnceAsync<MeliStockSyncWorker>(_factory);
        var priceOnly = Assert.Single(Puts());
        Assert.Contains("\"price\":30000", priceOnly);
        Assert.DoesNotContain("available_quantity", priceOnly);

        // Al volver a prenderlo, el stock viaja en la próxima pasada.
        await merchant.PutAsync($"/api/v1/admin/meli/items/{itemId}/sync", new { syncStock = true });
        await Workers.RunOnceAsync<MeliStockSyncWorker>(_factory);
        Assert.Equal(2, Puts().Count);
        Assert.Contains("\"available_quantity\":6", Puts().Last());
        Assert.DoesNotContain("price", Puts().Last());

        // Y sin el precio, un cambio de recargo no viaja a esta publicación.
        await merchant.PutAsync($"/api/v1/admin/meli/items/{itemId}/sync", new { syncPrice = false });
        await merchant.PutAsync("/api/v1/admin/meli/settings", new { stockSyncEnabled = true, priceSyncEnabled = true, priceMarkupPct = 20m });
        await Workers.RunOnceAsync<MeliStockSyncWorker>(_factory);
        Assert.Equal(2, Puts().Count);

        // Una publicación que no está vinculada no tiene switches.
        Assert.Equal(HttpStatusCode.NotFound, (await merchant.SendAsync(HttpMethod.Put,
            "/api/v1/admin/meli/items/MLA1/sync", new { syncStock = false })).StatusCode);
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

        // Un cuerpo que no es JSON (o no es un objeto) también: antes era un 500,
        // y ML reintenta todo lo que no sea 200 aunque reintentar no lo arregle.
        foreach (var raw in new[] { "{esto no es json", "[1,2,3]", "" })
        {
            var bad = await client.PostAsync("/api/v1/webhooks/meli",
                new StringContent(raw, System.Text.Encoding.UTF8, "application/json"));
            Assert.Equal(HttpStatusCode.OK, bad.StatusCode);
        }

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
    public async Task La_venta_que_ML_factura_sola_recibe_su_nota_de_credito_una_vez()
    {
        // La auto-factura de ML prendida y la emisión automática de la tienda
        // apagada: antes la NC de la cancelación se descartaba (la cola exigía
        // la automática de la tienda) y se volvía a intentar en cada aviso.
        var (merchant, userId) = await ConnectedAsync("mln");
        var arca = new FakeArca(_factory.ExternalHttp);
        await merchant.ConfigureFiscalAsync();
        await merchant.PutAsync("/api/v1/admin/meli/settings", new { stockSyncEnabled = false, autoInvoiceEnabled = true });
        var itemId = $"MLA{Random.Shared.NextInt64(1_000_000_000, 9_000_000_000)}";
        var saleId = userId * 10 + 8;
        async Task SyncAsync(string status)
        {
            _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/orders/{saleId}", Order(saleId, status, itemId, 1));
            await NotifyAsync(userId, $"/orders/{saleId}");
            await Workers.RunOnceAsync<MeliNotificationWorker>(_factory);
        }

        await SyncAsync("paid");
        Assert.Equal([saleId], (await merchant.GetAsync("/api/v1/admin/meli/orders?limit=25&estado=facturadas"))
            .GetProperty("items").EnumerateArray().Select(o => o.GetProperty("meliOrderId").GetInt64()));

        await SyncAsync("cancelled");
        await SyncAsync("cancelled"); // el aviso repetido no encola otra
        var orderId = await MeliOrderIdAsync(merchant.TenantId, saleId);
        await Workers.RunOnceAsync<FiscalEmissionWorker>(_factory);

        using var scope = _factory.Services.CreateScope();
        var fiscal = scope.ServiceProvider.GetRequiredService<global::Fiscal.Infrastructure.Persistence.FiscalDbContext>();
        var job = Assert.Single(await fiscal.EmissionJobs.AsNoTracking().Where(j => j.OrderId == orderId).ToListAsync());
        Assert.Equal(global::Fiscal.Core.Domain.FiscalJobKind.CreditNote, job.Kind);
        Assert.Equal(global::Fiscal.Core.Domain.FiscalJobStatus.Done, job.Status);
        var docs = await fiscal.Documents.AsNoTracking().Where(d => d.OrderId == orderId).ToListAsync();
        Assert.Equal(2, docs.Count); // la factura y su NC
        Assert.Contains(docs, d => d.CbteTipo == global::Fiscal.Core.Domain.CbteTipo.NotaCreditoB);
    }

    [Fact]
    public async Task Sin_emision_automatica_la_cancelacion_no_se_reintenta_en_cada_aviso()
    {
        // Facturada a mano y nadie emite solo: la NC no sale sola (queda para
        // hacerla a mano), y la venta queda resuelta en vez de volver a
        // intentarlo en cada sincronización.
        var (merchant, userId) = await ConnectedAsync("mlm");
        _ = new FakeArca(_factory.ExternalHttp);
        await merchant.ConfigureFiscalAsync();
        var itemId = $"MLA{Random.Shared.NextInt64(1_000_000_000, 9_000_000_000)}";
        var saleId = userId * 10 + 9;
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/orders/{saleId}", Order(saleId, "paid", itemId, 1));
        await NotifyAsync(userId, $"/orders/{saleId}");
        await Workers.RunOnceAsync<MeliNotificationWorker>(_factory);
        await merchant.PostAsync($"/api/v1/admin/meli/orders/{saleId}/invoice", new { });

        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/orders/{saleId}", Order(saleId, "cancelled", itemId, 1));
        await NotifyAsync(userId, $"/orders/{saleId}");
        await Workers.RunOnceAsync<MeliNotificationWorker>(_factory);

        using var scope = _factory.Services.CreateScope();
        var meli = scope.ServiceProvider.GetRequiredService<MercadoLibre.Infrastructure.MeliDbContext>();
        var row = await meli.Orders.IgnoreQueryFilters().AsNoTracking()
            .SingleAsync(o => o.TenantId == merchant.TenantId && o.MeliOrderId == saleId);
        Assert.True(row.CreditNoteIssued);
        var fiscal = scope.ServiceProvider.GetRequiredService<global::Fiscal.Infrastructure.Persistence.FiscalDbContext>();
        Assert.False(await fiscal.EmissionJobs.AsNoTracking().AnyAsync(j => j.OrderId == row.Id));
    }

    [Fact]
    public async Task Una_factura_de_homologacion_no_cuenta_en_produccion_y_la_auto_factura_la_hace_de_verdad()
    {
        // La lista marcaba "Facturada" (y la contaba en sus filtros) una venta
        // con solo una factura de prueba, y la auto-factura no la volvía a
        // facturar en producción.
        var (merchant, userId) = await ConnectedAsync("mlh");
        _ = new FakeArca(_factory.ExternalHttp);
        await merchant.ConfigureFiscalAsync();
        await merchant.PutAsync("/api/v1/admin/meli/settings", new { stockSyncEnabled = false, autoInvoiceEnabled = false });
        var itemId = $"MLA{Random.Shared.NextInt64(1_000_000_000, 9_000_000_000)}";
        var saleId = userId * 10 + 4;
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/orders/{saleId}", Order(saleId, "paid", itemId, 1));
        async Task SyncAsync()
        {
            await NotifyAsync(userId, $"/orders/{saleId}");
            await Workers.RunOnceAsync<MeliNotificationWorker>(_factory);
        }
        Task<long[]> ListAsync(string estado) => merchant.GetAsync($"/api/v1/admin/meli/orders?limit=25&estado={estado}")
            .ContinueWith(t => t.Result.GetProperty("items").EnumerateArray().Select(o => o.GetProperty("meliOrderId").GetInt64()).ToArray());
        Task<int> UnbilledOnHomeAsync() => merchant.GetAsync("/api/v1/home/todo")
            .ContinueWith(t => t.Result.GetProperty("mercadoLibre").GetProperty("unbilled").GetInt32());

        await SyncAsync();
        await merchant.PostAsync($"/api/v1/admin/meli/orders/{saleId}/invoice", new { });
        Assert.Equal([saleId], await ListAsync(MeliOrderFilters.Billed));
        Assert.Equal(0, await UnbilledOnHomeAsync());

        // En producción la de prueba no cuenta: la venta vuelve a "sin facturar".
        await merchant.SwitchFiscalEnvironmentAsync("PRODUCCION");
        Assert.Empty(await ListAsync(MeliOrderFilters.Billed));
        Assert.Equal([saleId], await ListAsync(MeliOrderFilters.Unbilled));
        Assert.Equal(1, await UnbilledOnHomeAsync());
        var row = Assert.Single((await merchant.GetAsync("/api/v1/admin/meli/orders?limit=25")).GetProperty("items").EnumerateArray());
        Assert.Equal(JsonValueKind.Null, row.GetProperty("fiscalDocumentId").ValueKind);

        // Con la auto-factura de ML prendida, el próximo aviso la factura de verdad.
        await merchant.PutAsync("/api/v1/admin/meli/settings", new { stockSyncEnabled = false, autoInvoiceEnabled = true });
        await SyncAsync();
        Assert.Equal([saleId], await ListAsync(MeliOrderFilters.Billed));
        Assert.Equal(0, await UnbilledOnHomeAsync());
        Assert.Equal(HttpStatusCode.Conflict,
            (await merchant.SendAsync(HttpMethod.Post, $"/api/v1/admin/meli/orders/{saleId}/invoice")).StatusCode);

        var orderId = await MeliOrderIdAsync(merchant.TenantId, saleId);
        using var scope = _factory.Services.CreateScope();
        var fiscal = scope.ServiceProvider.GetRequiredService<global::Fiscal.Infrastructure.Persistence.FiscalDbContext>();
        var environments = await fiscal.Documents.AsNoTracking()
            .Where(d => d.OrderId == orderId && d.Result == global::Fiscal.Core.Domain.FiscalResult.Authorized)
            .Select(d => d.Environment).ToListAsync();
        Assert.Equal(
            [global::Fiscal.Core.Domain.FiscalEnvironment.Homologacion, global::Fiscal.Core.Domain.FiscalEnvironment.Produccion],
            environments.Order());
    }

    [Fact]
    public async Task Cada_devolucion_parcial_de_una_venta_facturada_emite_su_nota_de_credito_una_vez()
    {
        // Con la auto-factura de ML prendida (y la automática de la tienda
        // apagada), cada devolución parcial es una NC por lo devuelto, con su
        // clave: el aviso repetido de ML no emite otra.
        var (merchant, userId) = await ConnectedAsync("mlp");
        _ = new FakeArca(_factory.ExternalHttp);
        await merchant.ConfigureFiscalAsync();
        await merchant.PutAsync("/api/v1/admin/meli/settings", new { stockSyncEnabled = false, autoInvoiceEnabled = true });
        var itemId = $"MLA{Random.Shared.NextInt64(1_000_000_000, 9_000_000_000)}";
        var saleId = userId * 10 + 3;
        async Task SyncAsync(string status, decimal refunded)
        {
            _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/orders/{saleId}", Order(saleId, status, itemId, 1, refunded: refunded));
            await NotifyAsync(userId, $"/orders/{saleId}");
            await Workers.RunOnceAsync<MeliNotificationWorker>(_factory);
        }

        await SyncAsync("paid", 0m); // la auto-factura: Factura B por 15.000
        var orderId = await MeliOrderIdAsync(merchant.TenantId, saleId);

        // ML devuelve 5.000: una NC por 5.000. El mismo aviso otra vez, nada.
        await SyncAsync("partially_refunded", 5_000m);
        await SyncAsync("partially_refunded", 5_000m);
        await Workers.RunOnceAsync<FiscalEmissionWorker>(_factory);

        // Después devuelve 3.000 más (8.000 en total): otra NC, por 3.000.
        await SyncAsync("partially_refunded", 8_000m);
        await Workers.RunOnceAsync<FiscalEmissionWorker>(_factory);

        using var scope = _factory.Services.CreateScope();
        var fiscal = scope.ServiceProvider.GetRequiredService<global::Fiscal.Infrastructure.Persistence.FiscalDbContext>();
        var jobs = await fiscal.EmissionJobs.AsNoTracking()
            .Where(j => j.OrderId == orderId && j.Kind == global::Fiscal.Core.Domain.FiscalJobKind.CreditNote)
            .OrderBy(j => j.GrossMinorUnits).ToListAsync();
        Assert.Equal(["ml-reembolso:500000-800000", "ml-reembolso:0-500000"], jobs.Select(j => j.IdempotencyKey));
        Assert.Equal([3_000_00L, 5_000_00L], jobs.Select(j => j.GrossMinorUnits));
        Assert.All(jobs, j => Assert.Equal(global::Fiscal.Core.Domain.FiscalJobStatus.Done, j.Status));
        var notes = await fiscal.Documents.AsNoTracking()
            .Where(d => d.OrderId == orderId && d.CbteTipo == global::Fiscal.Core.Domain.CbteTipo.NotaCreditoB
                        && d.Result == global::Fiscal.Core.Domain.FiscalResult.Authorized)
            .Select(d => d.ImpTotal).ToListAsync();
        Assert.Equal([3_000m, 5_000m], notes.Order());

        // El panel: lo devuelto está acreditado entero y queda el resto de la factura.
        var credit = (await merchant.GetAsync($"/api/v1/admin/meli/orders/{saleId}/credit")).GetProperty("credit");
        Assert.Equal(8_000_00, credit.GetProperty("credited").GetInt64());
        Assert.Equal(0, credit.GetProperty("refundedUncredited").GetInt64());
        Assert.Equal(7_000_00, credit.GetProperty("remaining").GetInt64());
        var row = Assert.Single((await merchant.GetAsync("/api/v1/admin/meli/orders?limit=25")).GetProperty("items").EnumerateArray());
        Assert.Equal(8_000m, row.GetProperty("refundedAmount").GetDecimal());
    }

    [Fact]
    public async Task Sin_emision_automatica_la_devolucion_parcial_queda_para_el_boton_de_nota_de_credito()
    {
        // Nadie emite solo: la NC no sale sola (y no se reintenta en cada
        // aviso), y desde la lista de ventas de ML se emite a mano.
        var (merchant, userId) = await ConnectedAsync("mlq");
        _ = new FakeArca(_factory.ExternalHttp);
        await merchant.ConfigureFiscalAsync();
        var itemId = $"MLA{Random.Shared.NextInt64(1_000_000_000, 9_000_000_000)}";
        var saleId = userId * 10 + 6;
        async Task SyncAsync(string status, decimal refunded)
        {
            _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/orders/{saleId}", Order(saleId, status, itemId, 1, refunded: refunded));
            await NotifyAsync(userId, $"/orders/{saleId}");
            await Workers.RunOnceAsync<MeliNotificationWorker>(_factory);
        }
        string CreditPath() => $"/api/v1/admin/meli/orders/{saleId}/credit";

        await SyncAsync("paid", 0m);
        // Sin factura no hay qué acreditar.
        Assert.Equal(HttpStatusCode.Conflict, (await merchant.SendAsync(HttpMethod.Get, CreditPath())).StatusCode);
        await merchant.PostAsync($"/api/v1/admin/meli/orders/{saleId}/invoice", new { });

        await SyncAsync("partially_refunded", 5_000m);
        await SyncAsync("partially_refunded", 5_000m);
        var orderId = await MeliOrderIdAsync(merchant.TenantId, saleId);
        using (var scope = _factory.Services.CreateScope())
        {
            var fiscal = scope.ServiceProvider.GetRequiredService<global::Fiscal.Infrastructure.Persistence.FiscalDbContext>();
            Assert.False(await fiscal.EmissionJobs.AsNoTracking().AnyAsync(j => j.OrderId == orderId));
            var meli = scope.ServiceProvider.GetRequiredService<MercadoLibre.Infrastructure.MeliDbContext>();
            var cached = await meli.Orders.IgnoreQueryFilters().AsNoTracking().SingleAsync(o => o.Id == orderId);
            Assert.Equal(5_000_00, cached.RefundCreditResolvedMinorUnits);
        }

        var credit = (await merchant.GetAsync(CreditPath())).GetProperty("credit");
        Assert.Equal(5_000_00, credit.GetProperty("refundedUncredited").GetInt64());
        Assert.Equal(15_000_00, credit.GetProperty("remaining").GetInt64());

        // A mano, desde la lista: por lo devuelto. El doble click no emite dos.
        var key = $"ml-{Guid.NewGuid():N}";
        Task<HttpResponseMessage> IssueAsync(decimal amount, string idempotencyKey) => merchant.SendAsync(HttpMethod.Post,
            $"/api/v1/admin/meli/orders/{saleId}/credit-notes", new { amount, reason = "Devolución parcial", idempotencyKey });
        var first = await (await IssueAsync(5_000m, key)).Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(first.GetProperty("authorized").GetBoolean(), first.ToString());
        var again = await (await IssueAsync(5_000m, key)).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(first.GetProperty("documentId").GetGuid(), again.GetProperty("documentId").GetGuid());

        credit = (await merchant.GetAsync(CreditPath())).GetProperty("credit");
        Assert.Equal(5_000_00, credit.GetProperty("credited").GetInt64());
        Assert.Equal(0, credit.GetProperty("refundedUncredited").GetInt64());

        // Más de lo que queda de la factura: error que lo dice, y nada emitido.
        Assert.Equal(HttpStatusCode.BadRequest, (await IssueAsync(10_001m, $"ml-{Guid.NewGuid():N}")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await IssueAsync(100m, "corta")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/admin/meli/orders/1/credit-notes",
            new { amount = 100m, idempotencyKey = $"ml-{Guid.NewGuid():N}" })).StatusCode);
    }

    private async Task<Guid> MeliOrderIdAsync(Guid tenantId, long meliOrderId)
    {
        using var scope = _factory.Services.CreateScope();
        var meli = scope.ServiceProvider.GetRequiredService<MercadoLibre.Infrastructure.MeliDbContext>();
        return await meli.Orders.IgnoreQueryFilters().AsNoTracking()
            .Where(o => o.TenantId == tenantId && o.MeliOrderId == meliOrderId)
            .Select(o => o.Id).SingleAsync();
    }

    [Fact]
    public async Task Una_venta_con_devolucion_parcial_cuenta_como_cobrada_en_todo_el_panel()
    {
        // La rentabilidad contaba solo "paid" y el resto del panel también
        // "partially_refunded": dos números distintos para las mismas ventas.
        var (merchant, userId) = await ConnectedAsync("mlr");
        var itemId = $"MLA{Random.Shared.NextInt64(1_000_000_000, 9_000_000_000)}";
        // La devuelta en parte: de los 15.000 quedaron cobrados 10.000.
        foreach (var (id, status, charged) in new[]
        {
            (userId * 10 + 1, "paid", 15_000m),
            (userId * 10 + 2, "partially_refunded", 10_000m),
            (userId * 10 + 3, "cancelled", 15_000m),
        })
        {
            _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/orders/{id}", Order(id, status, itemId, 1, paidAmount: charged));
            await NotifyAsync(userId, $"/orders/{id}");
            await Workers.RunOnceAsync<MeliNotificationWorker>(_factory);
        }

        // Las ventas de Order() son del 10-oct-2026: rango fijo para que el test no venza.
        var profitability = await merchant.GetAsync("/api/v1/stats/profitability?from=2026-10-01&to=2026-10-20");
        Assert.Equal(2, profitability.GetProperty("meli").GetProperty("orders").GetInt32());
        // La ganancia del canal cuenta lo cobrado (como los ingresos), no el
        // total de la venta: antes la devuelta en parte sumaba los 15.000 enteros.
        Assert.Equal(25_000_00, profitability.GetProperty("meli").GetProperty("revenue").GetInt64());
        var paid = await merchant.GetAsync($"/api/v1/admin/meli/orders?limit=25&estado={MeliOrderFilters.Paid}");
        Assert.Equal(2, paid.GetProperty("total").GetInt32());
    }

    [Fact]
    public async Task Las_publicaciones_se_piden_a_items_bulk_de_a_20_con_los_campos_con_prefijo_body()
    {
        var (merchant, userId) = await ConnectedAsync("mlb");

        // Pregunta: pide solo los campos de la ficha, cada uno con el prefijo body. que exige /items/bulk.
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/questions/search", new
        {
            total = 1,
            questions = new[] { new { id = 321L, text = "¿Hay?", status = "UNANSWERED", item_id = "MLA77", date_created = "2026-10-10" } },
        });
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/items/bulk?ids=MLA77", new object[]
        {
            new { status_code = 200, id = "MLA77", body = new { id = "MLA77", title = "Gorra", price = 9000m, currency_id = "ARS", available_quantity = 2 } },
        });
        var questions = await merchant.GetAsync("/api/v1/admin/meli/questions?status=UNANSWERED");
        Assert.Equal("Gorra", questions.GetProperty("questions")[0].GetProperty("item").GetProperty("title").GetString());
        var one = Assert.Single(_factory.ExternalHttp.SentTo($"{Api}/items/bulk?ids=MLA77"));
        Assert.Equal(HttpMethod.Get, one.Method);
        Assert.Null(one.Body);
        Assert.Equal("/items/bulk", one.Uri.AbsolutePath);
        Assert.Equal(
            "?ids=MLA77&attributes=body.id,body.title,body.thumbnail,body.price,body.currency_id,body.available_quantity,body.permalink,body.status",
            one.Uri.Query);
        Assert.StartsWith("Bearer ", one.Headers["Authorization"]);

        // Un pedido con más de 20 ids se trocea de a 20, sin tocar el orden.
        var ids = Enumerable.Range(1, 45).Select(i => $"MLX{i}").ToArray();
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/users/{userId}/items/search",
            new { results = ids, paging = new { total = 45 } });
        _factory.ExternalHttp.On(HttpMethod.Get, $"{Api}/items/bulk?ids=", (req, _) =>
        {
            var asked = HttpUtility.ParseQueryString(req.RequestUri!.Query)["ids"]!.Split(',');
            return FakeHttp.Json(asked.Select(id => new
            {
                status_code = 200,
                id,
                body = new { id, title = $"Título {id}", status = "active", price = 100m, available_quantity = 1 },
            }).ToArray());
        });
        var items = await merchant.GetAsync("/api/v1/admin/meli/items?limit=50");
        Assert.Equal(45, items.GetProperty("items").GetArrayLength());
        Assert.Equal("MLX45", items.GetProperty("items")[44].GetProperty("id").GetString());
        var sent = _factory.ExternalHttp.SentTo($"{Api}/items/bulk?ids=MLX").ToList();
        Assert.Equal(3, sent.Count);
        Assert.All(sent, r =>
        {
            Assert.Equal(HttpMethod.Get, r.Method);
            Assert.Null(r.Body);
        });
        Assert.Equal(
            [20, 20, 5],
            sent.Select(r => HttpUtility.ParseQueryString(r.Uri.Query)["ids"]!.Split(',').Length));
        Assert.Equal("?ids=" + string.Join(',', ids.Take(20)), sent[0].Uri.Query);
        Assert.Equal("?ids=" + string.Join(',', ids.Skip(40)), sent[2].Uri.Query);
    }

    /// <summary>Un comercio con una cuenta de ML conectada (sin ventas previas).</summary>
    private Task<(Merchant Merchant, long UserId)> ConnectedAsync(string tag) => MeliAccount.ConnectAsync(_factory, tag);

    private Task<HttpResponseMessage> NotifyAsync(long userId, string resource) =>
        _factory.CreateClient().PostAsJsonAsync("/api/v1/webhooks/meli",
            new { topic = "orders_v2", resource, user_id = userId, application_id = 1, attempts = 1 });
}
