using System.Net;
using System.Text.Json;

namespace IntegrationTests;

/// <summary>
/// El buscador del panel (Ctrl+K): agrupa ventas, clientes, productos/SKUs,
/// compras y proveedores, y cada grupo respeta los permisos de quien busca.
/// </summary>
[Collection("api")]
public sealed class GlobalSearchTests(ApiFactory factory)
{
    private static List<JsonElement> Group(JsonElement body, string name) =>
        body.GetProperty(name).EnumerateArray().ToList();

    private static Task<JsonElement> SearchAsync(Merchant merchant, string q) =>
        merchant.GetAsync($"/api/v1/search?q={Uri.EscapeDataString(q)}");

    [Fact]
    public async Task Encuentra_ventas_clientes_productos_compras_y_proveedores()
    {
        var merchant = await Merchant.CreateAsync(factory, "gs1");
        var (productId, variantId) = await merchant.CreateProductAsync("Mancuerna hexagonal", sku: "MAN-HEX-10");
        var order = await merchant.PostAsync("/api/v1/orders/manual", new
        {
            items = new[] { new { variantId, quantity = 1 } },
            paymentMethod = "cash",
            buyerEmail = "laura.gomez@test.local",
            buyerName = "Laura Gómez",
        });
        var orderId = order.GetProperty("id").GetGuid();
        await merchant.PostAsync("/api/v1/purchasing/purchase-orders", new
        {
            supplierName = "Laura Hierros SRL",
            reference = "IMP-2026-07",
            currency = "USD",
            exchangeRate = 1000m,
        });

        var laura = await SearchAsync(merchant, "laura");
        Assert.Equal(orderId, Assert.Single(Group(laura, "orders")).GetProperty("id").GetGuid());
        Assert.Equal("Laura Gómez", Assert.Single(Group(laura, "customers")).GetProperty("title").GetString());
        // El proveedor (y su compra) también se llama Laura.
        Assert.Single(Group(laura, "suppliers"));
        Assert.Single(Group(laura, "purchaseOrders"));

        // Por número de venta, con el numeral como se copia de la tabla, y por
        // el id corto de las etiquetas viejas.
        var number = order.GetProperty("number").GetInt32();
        var byNumber = Assert.Single(Group(await SearchAsync(merchant, $"#{number}"), "orders"));
        Assert.Equal(orderId, byNumber.GetProperty("id").GetGuid());
        Assert.StartsWith($"#{number} · ", byNumber.GetProperty("title").GetString());
        var shortId = "#" + orderId.ToString("N")[..8].ToUpperInvariant();
        Assert.Equal(orderId, Assert.Single(Group(await SearchAsync(merchant, shortId), "orders")).GetProperty("id").GetGuid());

        // Por SKU: dice cuál coincidió.
        var bySku = Assert.Single(Group(await SearchAsync(merchant, "man-hex"), "products"));
        Assert.Equal(productId, bySku.GetProperty("id").GetGuid());
        Assert.Equal("MAN-HEX-10", bySku.GetProperty("detail").GetString());
        // Por nombre, sin tildes ni orden.
        Assert.Single(Group(await SearchAsync(merchant, "hexagonal mancuerna"), "products"));

        // Por referencia de la compra.
        Assert.Single(Group(await SearchAsync(merchant, "IMP-2026"), "purchaseOrders"));
    }

    [Fact]
    public async Task Una_letra_no_busca_y_cada_grupo_respeta_los_permisos()
    {
        var merchant = await Merchant.CreateAsync(factory, "gs2");
        await merchant.CreateSaleAsync(buyerEmail: "permiso@test.local");

        var tiny = await SearchAsync(merchant, "p");
        Assert.Empty(Group(tiny, "orders"));

        var mate = await merchant.AddTeammateAsync("soporte", "gs2eq");
        await merchant.ExpectOkAsync(HttpMethod.Put, $"/api/v1/members/{mate.UserId}/permissions",
            new { permissions = new[] { "customers.read" } });
        var res = await mate.SendAsync(HttpMethod.Get, "/api/v1/search?q=permiso");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(JsonValueKind.Null, body.GetProperty("orders").ValueKind);
        Assert.Equal(JsonValueKind.Null, body.GetProperty("suppliers").ValueKind);
        Assert.Single(Group(body, "customers"));

        // Sin ninguno de los permisos que el buscador cubre, ni entra.
        await merchant.ExpectOkAsync(HttpMethod.Put, $"/api/v1/members/{mate.UserId}/permissions",
            new { permissions = new[] { "content.write" } });
        var denied = await mate.SendAsync(HttpMethod.Get, "/api/v1/search?q=permiso");
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
    }
}
