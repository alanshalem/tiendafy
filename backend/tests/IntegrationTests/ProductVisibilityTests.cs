using System.Net;
using System.Text.Json;

namespace IntegrationTests;

/// <summary>
/// El listado y el detalle de productos por id los usan la tienda (sin
/// sesión) y el panel. Un borrador o un archivado no se publicó: fuera del
/// equipo de la tienda no se ve, ni pidiéndolo por estado o por id. Antes
/// alcanzaba con el header de la tienda para leer los lanzamientos que
/// todavía no salían.
/// </summary>
[Collection("api")]
public sealed class ProductVisibilityTests
{
    private readonly ApiFactory _factory;

    public ProductVisibilityTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Sin_ser_del_equipo_solo_se_ven_los_productos_publicados()
    {
        var store = await Merchant.CreateAsync(_factory, "vis");
        var (active, _) = await store.CreateProductAsync("Publicado", stock: 0);
        var draft = (await store.PostAsync("/api/v1/products", new
        {
            name = "Lanzamiento secreto",
            variants = new[] { new { sku = $"SEC-{store.Subdomain}", priceAmount = 1000L, currency = "ARS" } },
        })).GetProperty("id").GetGuid();
        var (archived, _) = await store.CreateProductAsync("Discontinuado", stock: 0);
        await store.PostAsync($"/api/v1/products/{archived}/archive", new { });

        var anonymous = store.Anonymous();
        var otherStore = await Merchant.CreateAsync(_factory, "vio"); // con sesión, pero de otra tienda

        foreach (var outsider in new[] { anonymous, otherStore.Client })
        {
            async Task<List<Guid>> ListAsync(string query)
            {
                var res = await store.SendAsync(outsider, HttpMethod.Get, $"/api/v1/products{query}");
                Assert.Equal(HttpStatusCode.OK, res.StatusCode);
                return [.. (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("items")
                    .EnumerateArray().Select(p => p.GetProperty("id").GetGuid())];
            }

            Assert.Equal([active], await ListAsync(""));
            Assert.Equal([active], await ListAsync("?status=ACTIVE"));
            Assert.Equal([active], await ListAsync("?status=DRAFT"));
            Assert.Equal([active], await ListAsync("?status=ARCHIVED&limit=5"));
            Assert.Equal([active], await ListAsync("?offset=0&limit=10"));
            Assert.Equal([active], await ListAsync("?offset=0&status=DRAFT"));
            Assert.Equal([active], await ListAsync($"?ids={draft},{archived},{active}"));
            Assert.Empty(await ListAsync("?q=secreto&offset=0"));

            Assert.Equal(HttpStatusCode.NotFound, (await store.SendAsync(outsider, HttpMethod.Get, $"/api/v1/products/{draft}")).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await store.SendAsync(outsider, HttpMethod.Get, $"/api/v1/products/{archived}")).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await store.SendAsync(outsider, HttpMethod.Get, $"/api/v1/products/{active}")).StatusCode);
        }

        // El equipo ve todo, también quien no edita el catálogo: el inventario
        // del vendedor y los buscadores de compras listan los borradores.
        var seller = await store.AddTeammateAsync("vendedor", "visv");
        foreach (var member in new[] { store.Client, seller.Client })
        {
            var all = await store.SendAsync(member, HttpMethod.Get, "/api/v1/products?offset=0&limit=10");
            var ids = (await all.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("items")
                .EnumerateArray().Select(p => p.GetProperty("id").GetGuid()).ToList();
            Assert.Equal(3, ids.Count);
            Assert.Contains(draft, ids);
            Assert.Equal(HttpStatusCode.OK, (await store.SendAsync(member, HttpMethod.Get, $"/api/v1/products/{draft}")).StatusCode);
        }
        var drafts = await store.GetAsync("/api/v1/products?status=DRAFT");
        Assert.Equal(draft, drafts.GetProperty("items").EnumerateArray().Single().GetProperty("id").GetGuid());
    }
}
