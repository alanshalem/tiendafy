using System.Net;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace IntegrationTests;

/// <summary>
/// Los productos de las secciones de la portada (destacados, recién llegados,
/// ofertas, una categoría, una marca, lo más vendido), como los pide la tienda:
/// sin sesión, con el header de la tienda. Antes la tienda los armaba con los
/// 24 productos más nuevos que ya tenía: ofertas casi siempre quedaba vacía,
/// destacados y recién llegados eran lo mismo, y lo elegido a mano se mostraba
/// aunque estuviera en borrador o archivado.
/// </summary>
[Collection("api")]
public sealed class SectionProductsTests
{
    private readonly ApiFactory _factory;

    public SectionProductsTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Elegidos_a_mano_en_su_orden_y_solo_los_publicados()
    {
        var merchant = await Merchant.CreateAsync(_factory, "secm");
        var (a, _) = await merchant.CreateProductAsync("Uno", stock: 4);
        var (b, _) = await merchant.CreateProductAsync("Dos", stock: 0);
        var (c, _) = await merchant.CreateProductAsync("Tres", stock: 0);
        var archived = await merchant.CreateProductAsync("Archivado", stock: 0);
        await merchant.PostAsync($"/api/v1/products/{archived.ProductId}/archive", new { });
        var draft = await DraftAsync(merchant, "Borrador");
        var other = await Merchant.CreateAsync(_factory, "secm2");
        var (foreign, _) = await other.CreateProductAsync("Ajeno", stock: 0);

        var shopper = new Shopper(merchant);
        var items = await ItemsAsync(shopper,
            $"kind=manual&ids={c},{archived.ProductId},{a},{draft},{foreign},{Guid.NewGuid()},basura,{b}");

        // El orden del comercio; lo archivado, el borrador, lo ajeno y lo que no existe no ocupan lugar.
        Assert.Equal(["Tres", "Uno", "Dos"], Names(items));
        // El stock viaja para los avisos de la card, y el costo nunca.
        Assert.Equal(4, items.Single(i => i.GetProperty("name").GetString() == "Uno").GetProperty("stock").GetInt32());
        Assert.All(items, i => Assert.DoesNotContain("cost", i.GetRawText(), StringComparison.OrdinalIgnoreCase));

        Assert.Equal(["Tres", "Uno"], Names(await ItemsAsync(shopper, $"kind=manual&ids={c},{a},{b}&limit=2")));
        Assert.Empty(await ItemsAsync(shopper, "kind=manual"));
    }

    [Fact]
    public async Task Lo_ultimo_y_las_ofertas_de_todo_el_catalogo()
    {
        var merchant = await Merchant.CreateAsync(_factory, "secn");
        // La oferta es lo PRIMERO que se cargó: queda fuera de los 24 más
        // nuevos, que era todo lo que miraba la tienda para armar "Ofertas".
        await OfferAsync(merchant, "Oferta vieja", price: 80_00, compareAt: 100_00);
        await OfferAsync(merchant, "Tachado más barato", price: 100_00, compareAt: 90_00);
        await OfferAsync(merchant, "Tachado igual", price: 100_00, compareAt: 100_00);
        for (var i = 0; i < 24; i++) await merchant.CreateProductAsync($"Nuevo {i:00}", stock: 0);
        await DraftAsync(merchant, "Borrador nuevo");

        var shopper = new Shopper(merchant);

        var newest = Names(await ItemsAsync(shopper, "kind=newest&limit=24"));
        Assert.Equal(24, newest.Count);
        Assert.Equal("Nuevo 23", newest[0]);
        Assert.DoesNotContain("Borrador nuevo", newest);
        Assert.DoesNotContain("Oferta vieja", newest);
        // Sin límite van 8; más de 24 no se puede pedir.
        Assert.Equal(8, (await ItemsAsync(shopper, "kind=newest")).Count);
        Assert.Equal(24, (await ItemsAsync(shopper, "kind=newest&limit=500")).Count);

        // Oferta = el tachado supera al precio; un tachado igual o menor no lo es.
        Assert.Equal(["Oferta vieja"], Names(await ItemsAsync(shopper, "kind=on-sale")));
    }

    [Fact]
    public async Task Una_categoria_o_una_marca()
    {
        var merchant = await Merchant.CreateAsync(_factory, "secc");
        var calzado = (await merchant.PostAsync("/api/v1/categories", new { name = "Calzado" })).GetProperty("id").GetGuid();
        var running = (await merchant.PostAsync("/api/v1/categories", new { name = "Running", parentId = calzado })).GetProperty("id").GetGuid();

        var zapatilla = await merchant.CreateProductAsync("Zapatilla", priceMinor: 60_000_00, stock: 0);
        var ojota = await merchant.CreateProductAsync("Ojota", priceMinor: 8_000_00, stock: 0);
        var remera = await merchant.CreateProductAsync("Remera", priceMinor: 15_000_00, stock: 0);
        await merchant.PutAsync($"/api/v1/products/{zapatilla.ProductId}/categories", new { categoryIds = new[] { running } });
        await merchant.PutAsync($"/api/v1/products/{ojota.ProductId}/categories", new { categoryIds = new[] { calzado } });
        await merchant.PatchAsync($"/api/v1/products/{zapatilla.ProductId}", new { name = "Zapatilla", description = "x", brand = "Nike" });
        await merchant.PatchAsync($"/api/v1/products/{ojota.ProductId}", new { name = "Ojota", description = "x", brand = "NIKE" });
        await merchant.PatchAsync($"/api/v1/products/{remera.ProductId}", new { name = "Remera", description = "x", brand = "Adidas" });

        var shopper = new Shopper(merchant);

        // La categoría padre trae lo de sus subcategorías, salvo que se pida solo ella.
        Assert.Equal(["Ojota", "Zapatilla"], Names(await ItemsAsync(shopper, $"kind=category&categoryId={calzado}&sort=price_asc")));
        Assert.Equal(["Ojota"], Names(await ItemsAsync(shopper, $"kind=category&categoryId={calzado}&includeChildren=false")));
        Assert.Empty(await ItemsAsync(shopper, $"kind=category&categoryId={Guid.NewGuid()}"));

        // La marca, sin importar cómo se escribió en cada producto.
        Assert.Equal(["Zapatilla", "Ojota"], Names(await ItemsAsync(shopper, "kind=brand&brand=nike&sort=price_desc")));
        Assert.Equal(["Ojota", "Zapatilla"], Names(await ItemsAsync(shopper, "kind=brand&brand=Nike&sort=name")));

        // Lo que falta para resolver el origen es un error de quien lo pide, no una lista vacía.
        Assert.Equal(HttpStatusCode.BadRequest, (await shopper.SendAsync(HttpMethod.Get, "/api/v1/products/section?kind=category")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await shopper.SendAsync(HttpMethod.Get, "/api/v1/products/section?kind=brand&brand=%20")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await shopper.SendAsync(HttpMethod.Get, "/api/v1/products/section?kind=otra")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await shopper.SendAsync(HttpMethod.Get, "/api/v1/products/section")).StatusCode);
    }

    [Fact]
    public async Task Lo_mas_vendido_del_periodo()
    {
        var merchant = await Merchant.CreateAsync(_factory, "secb");
        var shopper = new Shopper(merchant);

        // Sin ventas no hay ranking: la tienda cae a lo último.
        Assert.Empty(await ItemsAsync(shopper, "kind=best-sellers"));

        var (poco, pocoVariant) = await merchant.CreateProductAsync("Poco vendido");
        var (mucho, muchoVariant) = await merchant.CreateProductAsync("Muy vendido");
        var (archivado, archivadoVariant) = await merchant.CreateProductAsync("Vendido y archivado");
        var (_, viejoVariant) = await merchant.CreateProductAsync("Vendido hace mucho");
        await merchant.CreateProductAsync("Nunca vendido");

        await SellAsync(merchant, pocoVariant, 1);
        await SellAsync(merchant, muchoVariant, 2);
        await SellAsync(merchant, muchoVariant, 1);
        await SellAsync(merchant, archivadoVariant, 10);
        var oldOrder = await SellAsync(merchant, viejoVariant, 20);
        // Lo que dejó de venderse no ocupa un lugar aunque haya vendido más.
        await merchant.PostAsync($"/api/v1/products/{archivado}/archive", new { });
        await BackdateAsync(oldOrder, days: 45);

        // Lo vendido en otra tienda no suma acá.
        var other = await Merchant.CreateAsync(_factory, "secb2");
        var (_, foreignVariant) = await other.CreateProductAsync("Ajeno");
        await SellAsync(other, foreignVariant, 50);

        Assert.Equal(["Muy vendido", "Poco vendido"], Names(await ItemsAsync(shopper, "kind=best-sellers")));
        Assert.Equal(["Muy vendido"], Names(await ItemsAsync(shopper, "kind=best-sellers&limit=1")));
        // Con un período más largo entra la venta vieja, que es la más grande.
        Assert.Equal(["Vendido hace mucho", "Muy vendido", "Poco vendido"],
            Names(await ItemsAsync(shopper, "kind=best-sellers&days=60")));
        Assert.Equal([mucho, poco], (await ItemsAsync(shopper, "kind=best-sellers")).Select(i => i.GetProperty("id").GetGuid()));
    }

    [Fact]
    public async Task Cada_tienda_ve_solo_lo_suyo()
    {
        var a = await Merchant.CreateAsync(_factory, "seca");
        var b = await Merchant.CreateAsync(_factory, "secz");
        var categoryA = (await a.PostAsync("/api/v1/categories", new { name = "Solo A" })).GetProperty("id").GetGuid();
        var (productA, _) = await a.CreateProductAsync("Producto de A", stock: 0);
        await a.PutAsync($"/api/v1/products/{productA}/categories", new { categoryIds = new[] { categoryA } });
        await a.PatchAsync($"/api/v1/products/{productA}", new { name = "Producto de A", description = "x", brand = "MarcaA" });
        await OfferAsync(a, "Oferta de A", price: 50_00, compareAt: 90_00);

        var fromB = new Shopper(b);
        Assert.Empty(await ItemsAsync(fromB, $"kind=manual&ids={productA}"));
        Assert.Empty(await ItemsAsync(fromB, $"kind=category&categoryId={categoryA}"));
        Assert.Empty(await ItemsAsync(fromB, "kind=brand&brand=MarcaA"));
        Assert.Empty(await ItemsAsync(fromB, "kind=on-sale"));
        Assert.Empty(await ItemsAsync(fromB, "kind=newest"));

        var fromA = new Shopper(a);
        Assert.Equal(["Producto de A"], Names(await ItemsAsync(fromA, $"kind=category&categoryId={categoryA}")));
    }

    // ---------------------------------------------------------------- helpers

    private static async Task<List<JsonElement>> ItemsAsync(Shopper shopper, string query) =>
        [.. (await shopper.ExpectJsonAsync(HttpMethod.Get, $"/api/v1/products/section?{query}"))
            .GetProperty("items").EnumerateArray()];

    private static List<string> Names(IEnumerable<JsonElement> items) =>
        [.. items.Select(i => i.GetProperty("name").GetString()!)];

    private static async Task<Guid> DraftAsync(Merchant merchant, string name)
    {
        var body = await merchant.PostAsync("/api/v1/products", new
        {
            name,
            description = "x",
            publish = false,
            variants = new[] { new { sku = $"DR-{Guid.NewGuid():N}"[..20], optionValues = Array.Empty<string>(), priceAmount = 1_000_00L, currency = "ARS" } },
        });
        return body.GetProperty("id").GetGuid();
    }

    private static async Task OfferAsync(Merchant merchant, string name, long price, long compareAt) =>
        await merchant.PostAsync("/api/v1/products", new
        {
            name,
            description = "x",
            publish = true,
            variants = new[] { new { sku = $"OF-{Guid.NewGuid():N}"[..20], optionValues = Array.Empty<string>(), priceAmount = price, currency = "ARS", compareAtAmount = compareAt } },
        });

    private static async Task<Guid> SellAsync(Merchant merchant, Guid variantId, int quantity)
    {
        var order = await merchant.PostAsync("/api/v1/orders/manual", new
        {
            items = new[] { new { variantId, quantity } },
            paymentMethod = "cash",
            buyerEmail = "comprador@test.local",
            buyerName = "Comprador de Test",
        });
        return order.GetProperty("id").GetGuid();
    }

    private async Task BackdateAsync(Guid orderId, int days)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<Orders.Infrastructure.Persistence.OrdersDbContext>();
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE orders SET paid_at_utc = {DateTime.UtcNow.AddDays(-days)}, created_at_utc = {DateTime.UtcNow.AddDays(-days)} WHERE id = {orderId}");
    }
}
