using System.Net;
using System.Text.Json;

namespace IntegrationTests;

/// <summary>
/// La ficha del cliente y la agenda con su resumen de compras: lo que compró
/// cada uno, los segmentos para filtrar ("compró hace más de 90 días", "más de
/// N compras"), las etiquetas y la búsqueda por teléfono, que vive cifrado.
/// </summary>
[Collection("api")]
public sealed class CustomerProfileTests(ApiFactory factory)
{
    private static List<JsonElement> Items(JsonElement page) => page.GetProperty("items").EnumerateArray().ToList();

    private static async Task<JsonElement> ByEmailAsync(Merchant merchant, string email) =>
        Items(await merchant.GetAsync($"/api/v1/customers?q={Uri.EscapeDataString(email)}"))
            .Single(c => c.GetProperty("email").GetString() == email);

    [Fact]
    public async Task Cada_venta_cobrada_suma_al_resumen_y_la_ficha_muestra_su_historia()
    {
        var merchant = await Merchant.CreateAsync(factory, "cp1");
        await merchant.CreateSaleAsync(priceMinor: 30_000_00, buyerEmail: "fiel@test.local");
        var second = await merchant.CreateSaleAsync(priceMinor: 10_000_00, buyerEmail: "fiel@test.local");
        await merchant.CreateSaleAsync(priceMinor: 5_000_00, buyerEmail: "una-vez@test.local");

        var fiel = await ByEmailAsync(merchant, "fiel@test.local");
        Assert.Equal(2, fiel.GetProperty("ordersCount").GetInt32());
        Assert.Equal(40_000_00, fiel.GetProperty("totalSpentMinor").GetInt64());
        Assert.NotEqual(JsonValueKind.Null, fiel.GetProperty("lastOrderAtUtc").ValueKind);

        var profile = await merchant.GetAsync($"/api/v1/customers/{fiel.GetProperty("id").GetGuid()}");
        var stats = profile.GetProperty("stats");
        Assert.Equal(2, stats.GetProperty("ordersCount").GetInt32());
        Assert.Equal(40_000_00, stats.GetProperty("totalSpentMinor").GetInt64());
        Assert.Equal(20_000_00, stats.GetProperty("averageTicketMinor").GetInt64());
        var orders = profile.GetProperty("orders").EnumerateArray().ToList();
        Assert.Equal(2, orders.Count);
        // La más nueva primero, con lo necesario para linkearla a Ventas.
        Assert.Equal(second, orders[0].GetProperty("id").GetGuid());
        Assert.Equal("PAID", orders[0].GetProperty("status").GetString());
        Assert.Equal(10_000_00, orders[0].GetProperty("totalMinor").GetInt64());
    }

    [Fact]
    public async Task La_agenda_ordena_por_lo_gastado_y_filtra_por_segmento()
    {
        var merchant = await Merchant.CreateAsync(factory, "cp2");
        await merchant.CreateSaleAsync(priceMinor: 5_000_00, buyerEmail: "chico@test.local");
        await merchant.CreateSaleAsync(priceMinor: 90_000_00, buyerEmail: "grande@test.local");
        await merchant.CreateSaleAsync(priceMinor: 1_000_00, buyerEmail: "frecuente@test.local");
        await merchant.CreateSaleAsync(priceMinor: 1_000_00, buyerEmail: "frecuente@test.local");
        await merchant.CreateSaleAsync(priceMinor: 1_000_00, buyerEmail: "frecuente@test.local");
        await merchant.PostAsync("/api/v1/customers", new { name = "Nunca compró", email = "nunca@test.local" });

        var bySpent = Items(await merchant.GetAsync("/api/v1/customers?sort=spent&desc=true"))
            .Select(c => c.GetProperty("email").GetString()).ToList();
        Assert.Equal(["grande@test.local", "chico@test.local", "frecuente@test.local", "nunca@test.local"], bySpent);

        var frequent = Items(await merchant.GetAsync("/api/v1/customers?minOrders=3"));
        Assert.Equal("frecuente@test.local", Assert.Single(frequent).GetProperty("email").GetString());

        var never = Items(await merchant.GetAsync("/api/v1/customers?neverBought=true"));
        Assert.Equal("nunca@test.local", Assert.Single(never).GetProperty("email").GetString());

        // Todos compraron hoy: nadie está "inactivo hace 90 días", y el que
        // nunca compró tampoco (es otro segmento).
        var page = await merchant.GetAsync("/api/v1/customers?inactiveDays=90");
        Assert.Equal(0, page.GetProperty("total").GetInt32());

        // "Última compra": los que nunca compraron, al final en los dos sentidos.
        foreach (var desc in new[] { "true", "false" })
        {
            var byLast = Items(await merchant.GetAsync($"/api/v1/customers?sort=last&desc={desc}"));
            Assert.Equal("nunca@test.local", byLast[^1].GetProperty("email").GetString());
        }
    }

    [Fact]
    public async Task Etiquetas_desde_la_ficha_y_filtro_por_etiqueta()
    {
        var merchant = await Merchant.CreateAsync(factory, "cp3");
        var gym = await merchant.PostAsync("/api/v1/customers", new { name = "Gimnasio Sur", email = "sur@test.local" });
        await merchant.PostAsync("/api/v1/customers", new { name = "Particular", email = "part@test.local" });
        var id = gym.GetProperty("id").GetGuid();

        var patched = await merchant.PatchAsync($"/api/v1/customers/{id}", new { tags = new[] { "Mayorista", "mayorista", "VIP" }, notes = "Paga a 30 días" });
        Assert.Equal(["Mayorista", "VIP"], patched.GetProperty("tags").EnumerateArray().Select(t => t.GetString()));
        Assert.Equal("Paga a 30 días", patched.GetProperty("notes").GetString());

        // Editar los datos desde el modal (que no manda etiquetas) no las borra.
        await merchant.PutAsync($"/api/v1/customers/{id}", new { name = "Gimnasio Sur SRL", email = "sur@test.local" });
        var tagged = Items(await merchant.GetAsync("/api/v1/customers?tag=mayorista"));
        Assert.Equal("Gimnasio Sur SRL", Assert.Single(tagged).GetProperty("name").GetString());

        var tags = Items(await merchant.GetAsync("/api/v1/customers/tags"));
        Assert.Equal(["Mayorista", "VIP"], tags.Select(t => t.GetProperty("tag").GetString()).Order());

        var tooMany = await merchant.SendAsync(HttpMethod.Patch, $"/api/v1/customers/{id}",
            new { tags = Enumerable.Range(1, 11).Select(i => $"t{i}").ToArray() });
        Assert.Equal(HttpStatusCode.BadRequest, tooMany.StatusCode);
    }

    [Fact]
    public async Task Se_encuentra_por_telefono_aunque_este_cifrado_y_escrito_distinto()
    {
        var merchant = await Merchant.CreateAsync(factory, "cp4");
        await merchant.PostAsync("/api/v1/customers", new { name = "Laura", email = "laura@test.local", phone = "+54 9 11 4567-8901" });
        await merchant.PostAsync("/api/v1/customers", new { name = "Otro", email = "otro@test.local", phone = "351 555 0000" });

        var hits = Items(await merchant.GetAsync($"/api/v1/customers?q={Uri.EscapeDataString("11 4567 8901")}"));
        Assert.Equal("Laura", Assert.Single(hits).GetProperty("name").GetString());
    }

    [Fact]
    public async Task Traer_de_mis_ventas_recalcula_el_resumen_de_las_fichas_cargadas_a_mano()
    {
        var merchant = await Merchant.CreateAsync(factory, "cp5");
        await merchant.CreateSaleAsync(priceMinor: 12_000_00, buyerEmail: "mayus@test.local");
        // Una ficha cargada a mano con el email en mayúsculas es la misma persona.
        var listed = await ByEmailAsync(merchant, "mayus@test.local");
        await merchant.ExpectOkAsync(HttpMethod.Delete, $"/api/v1/customers/{listed.GetProperty("id").GetGuid()}");
        var manual = await merchant.PostAsync("/api/v1/customers", new { name = "Mayus", email = "Mayus@Test.local" });
        Assert.Equal(1, manual.GetProperty("ordersCount").GetInt32());

        await merchant.PostAsync("/api/v1/customers/sync-from-orders", new { });
        var after = await merchant.GetAsync($"/api/v1/customers/{manual.GetProperty("id").GetGuid()}");
        Assert.Equal(12_000_00, after.GetProperty("customer").GetProperty("totalSpentMinor").GetInt64());
    }

    [Fact]
    public async Task Sin_permiso_de_ventas_la_ficha_no_muestra_el_historial()
    {
        var merchant = await Merchant.CreateAsync(factory, "cp6");
        await merchant.CreateSaleAsync(priceMinor: 8_000_00, buyerEmail: "visto@test.local");
        var customer = await ByEmailAsync(merchant, "visto@test.local");

        // Alguien del equipo que ve la agenda pero no las ventas (excepción por persona).
        var mate = await merchant.AddTeammateAsync("soporte", "cp6eq");
        await merchant.ExpectOkAsync(HttpMethod.Put, $"/api/v1/members/{mate.UserId}/permissions",
            new { permissions = new[] { "customers.read" } });
        var res = await mate.SendAsync(HttpMethod.Get, $"/api/v1/customers/{customer.GetProperty("id").GetGuid()}");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(JsonValueKind.Null, body.GetProperty("orders").ValueKind);
        Assert.Equal(1, body.GetProperty("stats").GetProperty("ordersCount").GetInt32());
    }
}
