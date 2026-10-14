using System.Net;
using System.Text.Json;
using Api.Fulfillment;
using QuestPDF.Fluent;
using QuestPDF.Infrastructure;

namespace IntegrationTests;

/// <summary>
/// Despacho: la cola de lo cobrado sin despachar, la lista de picking de
/// varios pedidos (una línea por variante, en el orden del recorrido por el
/// depósito), remitos y etiquetas en lote, y "despachar escaneando", que no
/// deja salir un pedido incompleto, con sobrantes o con un producto ajeno.
/// </summary>
[Collection("api")]
public sealed class FulfillmentTests(ApiFactory factory)
{
    [Fact]
    public async Task La_lista_de_picking_junta_las_variantes_de_varios_pedidos()
    {
        var store = await Merchant.CreateAsync(factory, "pck");
        var (_, shirt) = await store.CreateProductAsync("Remera azul", sku: $"REM-{store.Subdomain}");
        var (_, cap) = await store.CreateProductAsync("Gorra", sku: $"GOR-{store.Subdomain}");
        await store.ExpectOkAsync(HttpMethod.Put, $"/api/v1/inventory/{shirt}/location", new { location = "B3" });

        var first = await SaleAsync(store, (shirt, 2), (cap, 1));
        var second = await SaleAsync(store, (shirt, 1));
        var shipped = await SaleAsync(store, (cap, 1));
        await store.ExpectOkAsync(HttpMethod.Post, $"/api/v1/orders/{shipped}/fulfill", new { tracking = (string?)null });

        var pick = await store.PostAsync("/api/v1/fulfillment/pick-list",
            new { orderIds = new[] { first, second, shipped, Guid.NewGuid() } });
        var lines = pick.GetProperty("lines").EnumerateArray().ToList();
        Assert.Equal(2, lines.Count);

        // Con ubicación primero (es el recorrido), y la remera UNA vez con las 3 unidades.
        var shirtLine = lines[0];
        Assert.Equal(shirt, shirtLine.GetProperty("variantId").GetGuid());
        Assert.Equal("B3", shirtLine.GetProperty("location").GetString());
        Assert.Equal(3, shirtLine.GetProperty("quantity").GetInt32());
        var perOrder = shirtLine.GetProperty("orders").EnumerateArray()
            .ToDictionary(o => o.GetProperty("orderId").GetGuid(), o => o.GetProperty("quantity").GetInt32());
        Assert.Equal(2, perOrder[first]);
        Assert.Equal(1, perOrder[second]);
        Assert.Equal(1, lines[1].GetProperty("quantity").GetInt32());
        Assert.Equal(JsonValueKind.Null, lines[1].GetProperty("location").ValueKind);

        Assert.Equal(2, pick.GetProperty("orders").GetInt32());
        Assert.Equal(4, pick.GetProperty("units").GetInt32());
        var skipped = pick.GetProperty("skipped").EnumerateArray().ToList();
        Assert.Equal(2, skipped.Count); // la despachada y la que no existe
        Assert.Contains(skipped, s => s.GetProperty("orderId").GetGuid() == shipped
            && s.GetProperty("reason").GetString()!.Contains("despachada"));

        // La cola: lo cobrado sin despachar, sin la que ya salió.
        var queue = (await store.GetAsync("/api/v1/fulfillment/queue")).GetProperty("items").EnumerateArray()
            .Select(o => o.GetProperty("id").GetGuid()).ToList();
        Assert.Contains(first, queue);
        Assert.Contains(second, queue);
        Assert.DoesNotContain(shipped, queue);
        Assert.Empty((await store.GetAsync("/api/v1/fulfillment/queue?carrier=andreani")).GetProperty("items").EnumerateArray());

        // Remitos: un PDF con una hoja por pedido.
        var slips = await store.SendAsync(HttpMethod.Post, "/api/v1/fulfillment/packing-slips", new { orderIds = new[] { first, second } });
        Assert.Equal(HttpStatusCode.OK, slips.StatusCode);
        Assert.Equal("application/pdf", slips.Content.Headers.ContentType?.MediaType);
        Assert.StartsWith("%PDF", System.Text.Encoding.ASCII.GetString((await slips.Content.ReadAsByteArrayAsync())[..4]));

        // Etiquetas: sin envío creado con un carrier, se dice por cuál y no se inventa un PDF.
        var labels = await store.PostAsync("/api/v1/fulfillment/labels", new { orderIds = new[] { first } });
        var result = Assert.Single(labels.GetProperty("results").EnumerateArray());
        Assert.Equal("sin-envio", result.GetProperty("status").GetString());
        Assert.Equal(JsonValueKind.Null, labels.GetProperty("pdfBase64").ValueKind);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await store.SendAsync(HttpMethod.Post,
            "/api/v1/fulfillment/labels?format=pdf", new { orderIds = new[] { first } })).StatusCode);

        Assert.Equal(HttpStatusCode.BadRequest, (await store.SendAsync(HttpMethod.Post,
            "/api/v1/fulfillment/pick-list", new { orderIds = Array.Empty<Guid>() })).StatusCode);

        // De otra tienda no se ve nada; sin permiso de despacho, tampoco.
        var other = await Merchant.CreateAsync(factory, "pco");
        var foreign = await other.PostAsync("/api/v1/fulfillment/pick-list", new { orderIds = new[] { first } });
        Assert.Empty(foreign.GetProperty("lines").EnumerateArray());
        var catalog = await store.AddTeammateAsync("catalogo");
        Assert.Equal(HttpStatusCode.Forbidden, await catalog.StatusAsync(HttpMethod.Get, "/api/v1/fulfillment/queue"));
    }

    [Fact]
    public async Task Despachar_escaneando_valida_cantidades_y_productos()
    {
        var store = await Merchant.CreateAsync(factory, "scn");
        var (shirtProduct, shirt) = await store.CreateProductAsync("Remera roja", sku: $"ROJ-{store.Subdomain}");
        var capSku = $"GRR-{store.Subdomain}";
        var (_, cap) = await store.CreateProductAsync("Gorra", sku: capSku);
        var (_, other) = await store.CreateProductAsync("Media", sku: $"MED-{store.Subdomain}");
        var barcode = $"779{Random.Shared.NextInt64(1_000_000_000, 9_999_999_999)}";
        await store.ExpectOkAsync(HttpMethod.Put, $"/api/v1/products/{shirtProduct}/variants/{shirt}/barcode", new { barcode });

        var order = await SaleAsync(store, (shirt, 2), (cap, 1));
        var dispatch = "/api/v1/fulfillment/scan-dispatch";

        // El pedido se encuentra por el número corto de la etiqueta o por el QR del remito.
        var number = $"#{order.ToString("N")[..8].ToUpperInvariant()}";
        Assert.Equal(order, (await store.GetAsync($"/api/v1/fulfillment/orders/resolve?code={Uri.EscapeDataString(number)}")).GetProperty("id").GetGuid());
        var resolved = await store.GetAsync($"/api/v1/fulfillment/orders/resolve?code={order}");
        Assert.Contains(resolved.GetProperty("items").EnumerateArray(), i => i.GetProperty("barcode").GetString() == barcode);
        Assert.Equal(HttpStatusCode.NotFound, (await store.SendAsync(HttpMethod.Get, "/api/v1/fulfillment/orders/resolve?code=nada")).StatusCode);

        // Falta una remera.
        var missing = await store.SendAsync(HttpMethod.Post, dispatch, new
        {
            orderId = order,
            scans = new object[] { new { code = barcode, quantity = 1 }, new { code = capSku, quantity = 1 } },
        });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, missing.StatusCode);
        var problem = await missing.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Contains("faltan 1", problem.GetProperty("detail").GetString());
        var shirtCheck = problem.GetProperty("lines").EnumerateArray().Single(l => l.GetProperty("variantId").GetGuid() == shirt);
        Assert.Equal(2, shirtCheck.GetProperty("expected").GetInt32());
        Assert.Equal(1, shirtCheck.GetProperty("scanned").GetInt32());

        // Un producto de otro pedido, y un código que no existe.
        var wrong = await store.SendAsync(HttpMethod.Post, dispatch, new
        {
            orderId = order,
            scans = new object[]
            {
                new { code = barcode, quantity = 2 }, new { code = capSku, quantity = 1 },
                new { variantId = other, quantity = 1 }, new { code = "000-no-existe", quantity = 1 },
            },
        });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, wrong.StatusCode);
        var wrongProblem = await wrong.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Contains("no va en este pedido", wrongProblem.GetProperty("detail").GetString());
        Assert.Equal("000-no-existe", Assert.Single(wrongProblem.GetProperty("unknownCodes").EnumerateArray()).GetString());

        // Sobra una gorra.
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await store.SendAsync(HttpMethod.Post, dispatch, new
        {
            orderId = order,
            scans = new object[] { new { code = barcode, quantity = 2 }, new { code = capSku, quantity = 2 } },
        })).StatusCode);

        // Nada se despachó en el camino.
        Assert.Equal("PAID", (await store.GetAsync($"/api/v1/orders/{order}")).GetProperty("status").GetString());

        // Completo: sale despachado con el seguimiento.
        var done = await store.PostAsync(dispatch, new
        {
            orderId = order,
            scans = new object[] { new { code = barcode, quantity = 1 }, new { code = barcode, quantity = 1 }, new { code = capSku, quantity = 1 } },
            tracking = "TRK-123",
        });
        Assert.Equal("FULFILLED", done.GetProperty("status").GetString());
        Assert.Equal("TRK-123", done.GetProperty("tracking").GetString());
        Assert.Equal("FULFILLED", (await store.GetAsync($"/api/v1/orders/{order}")).GetProperty("status").GetString());

        var again = await store.SendAsync(HttpMethod.Post, dispatch, new
        {
            orderId = order,
            scans = new object[] { new { code = barcode, quantity = 2 }, new { code = capSku, quantity = 1 } },
        });
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
    }

    [Fact]
    public void Las_etiquetas_de_varios_envios_salen_en_un_solo_pdf()
    {
        QuestPDF.Settings.License = LicenseType.Community;
        static byte[] Page(string text) =>
            Document.Create(d => d.Page(p => p.Content().Text(text))).GeneratePdf();

        var merged = CarrierLabels.Merge([Page("Etiqueta 1"), Page("Etiqueta 2"), Page("Etiqueta 3")]);
        Assert.StartsWith("%PDF", System.Text.Encoding.ASCII.GetString(merged[..4]));
        // Tres páginas: cada una declara su /Type /Page.
        var text = System.Text.Encoding.Latin1.GetString(merged);
        Assert.Equal(3, System.Text.RegularExpressions.Regex.Count(text, @"/Type\s*/Page[^s]"));
    }

    /// <summary>Una venta de mostrador cobrada con esas variantes y cantidades.</summary>
    private static async Task<Guid> SaleAsync(Merchant store, params (Guid VariantId, int Quantity)[] lines)
    {
        var order = await store.PostAsync("/api/v1/orders/manual", new
        {
            items = lines.Select(l => new { variantId = l.VariantId, quantity = l.Quantity }).ToArray(),
            paymentMethod = "cash",
            buyerEmail = $"{$"c{Guid.NewGuid():N}"[..12]}@test.local",
            buyerName = "Comprador de Test",
        });
        return order.GetProperty("id").GetGuid();
    }
}
