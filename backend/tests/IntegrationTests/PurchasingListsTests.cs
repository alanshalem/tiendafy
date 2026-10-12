using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;

namespace IntegrationTests;

/// <summary>
/// Compras, lo que rodea a la orden: los grupos de la lista (abiertas, en
/// camino, recibidas sin factura), la reposición sugerida que cuenta lo que se
/// vende dentro de un kit, y el tope de tamaño de la factura a leer con IA.
/// </summary>
[Collection("api")]
public sealed class PurchasingListsTests(ApiFactory factory)
{
    private const string Orders = "/api/v1/purchasing/purchase-orders";

    private static async Task<Guid> OrderAsync(Merchant merchant, Guid variantId, params string[] statuses)
    {
        var po = await merchant.PostAsync(Orders, new
        {
            supplierName = "Proveedor",
            currency = "ARS",
            exchangeRate = 1m,
            items = new[] { new { variantId, quantity = 10, unitCost = 1_000m } },
        });
        var id = po.GetProperty("id").GetGuid();
        foreach (var status in statuses)
            await merchant.PostAsync($"{Orders}/{id}/status", new { status });
        return id;
    }

    private static async Task<int> CountAsync(Merchant merchant, string group) =>
        (await merchant.GetAsync($"{Orders}?group={group}")).GetProperty("items").GetArrayLength();

    [Fact]
    public async Task Los_grupos_de_la_lista()
    {
        var merchant = await Merchant.CreateAsync(factory, "pgr");
        var (_, variant) = await merchant.CreateProductAsync("Pesa rusa", stock: 0);

        await OrderAsync(merchant, variant);                                  // borrador
        await OrderAsync(merchant, variant, "Confirmed", "InTransit");        // en camino
        var received = await OrderAsync(merchant, variant, "Confirmed");
        await merchant.PostAsync($"{Orders}/{received}/receive",
            new { items = new[] { new { variantId = variant, receivedQuantity = 10 } } });
        await OrderAsync(merchant, variant, "Cancelled");                     // cancelada

        Assert.Equal(2, await CountAsync(merchant, "open"));                  // borrador + en camino
        Assert.Equal(1, await CountAsync(merchant, "intransit"));
        Assert.Equal(1, await CountAsync(merchant, "invoicemissing"));        // recibida sin factura
        Assert.Equal(4, await CountAsync(merchant, "cualquier-cosa"));        // grupo desconocido: todas
    }

    [Fact]
    public async Task La_reposicion_cuenta_lo_que_se_vende_dentro_de_un_kit()
    {
        var merchant = await Merchant.CreateAsync(factory, "pkt");
        var (_, disc) = await merchant.CreateProductAsync($"Disco {merchant.Subdomain}", priceMinor: 30_000_00, stock: 2);
        var (_, kit) = await merchant.CreateProductAsync($"Kit {merchant.Subdomain}", priceMinor: 70_000_00, stock: 10);
        await merchant.PutAsync($"/api/v1/products/variants/{kit}/kit",
            new { components = new[] { new { componentVariantId = disc, quantity = 2 } } });

        // Se venden kits, no discos sueltos: igual hay que reponer discos.
        await merchant.PostAsync("/api/v1/orders/manual",
            new { items = new[] { new { variantId = kit, quantity = 1 } }, paymentMethod = "cash" });

        var suggestions = (await merchant.GetAsync("/api/v1/purchasing/reorder-suggestions?windowDays=30&bufferDays=10"))
            .GetProperty("items").EnumerateArray().ToList();
        Assert.Contains(suggestions, s => s.GetProperty("variantId").GetGuid() == disc);
    }

    [Fact]
    public async Task Una_factura_de_mas_de_10_MB_no_se_manda_a_leer()
    {
        var merchant = await Merchant.CreateAsync(factory, "pbg");
        var (_, variant) = await merchant.CreateProductAsync("Banco", stock: 0);
        var po = await OrderAsync(merchant, variant);

        using var form = new MultipartFormDataContent
        {
            { new ByteArrayContent(new byte[10 * 1024 * 1024 + 1]) { Headers = { ContentType = new MediaTypeHeaderValue("application/pdf") } }, "file", "factura.pdf" },
        };
        var req = new HttpRequestMessage(HttpMethod.Post, $"{Orders}/{po}/invoice/scan") { Content = form };
        req.Headers.Add("X-Tenant-Id", merchant.TenantId.ToString());
        var res = await merchant.Client.SendAsync(req);
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Equal("Invoice.TooLarge", (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("title").GetString());
    }
}
