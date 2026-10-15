using System.Net;
using System.Text.Json;

namespace IntegrationTests;

/// <summary>
/// Los listados del panel que antes venían enteros y ahora van de a una
/// página: con <c>limit</c>/<c>offset</c>, un <c>total</c> que cuenta todo lo
/// que hay (no lo de la página) y la búsqueda en la base donde la hay.
/// </summary>
[Collection("api")]
public sealed class ListPagingTests(ApiFactory factory)
{
    private static List<JsonElement> Items(JsonElement body) => [.. body.GetProperty("items").EnumerateArray()];

    private static int Total(JsonElement body) => body.GetProperty("total").GetInt32();

    [Fact]
    public async Task Paginas_de_a_una_pagina_y_con_busqueda()
    {
        var merchant = await Merchant.CreateAsync(factory, "pgs");
        foreach (var title in new[] { "Cómo comprar", "Envíos", "Cambios y devoluciones" })
            await merchant.PostAsync("/api/v1/pages", new { title, body = "<p>texto</p>", published = true });

        var first = await merchant.GetAsync("/api/v1/pages?limit=2");
        Assert.Equal(2, Items(first).Count);
        Assert.Equal(3, Total(first));
        var rest = await merchant.GetAsync("/api/v1/pages?limit=2&offset=2");
        Assert.Single(Items(rest));
        // Ninguna se repite entre páginas.
        Assert.DoesNotContain(Items(first), p => p.GetProperty("id").GetGuid() == Items(rest)[0].GetProperty("id").GetGuid());

        var found = await merchant.GetAsync("/api/v1/pages?q=ENV");
        Assert.Equal("Envíos", Assert.Single(Items(found)).GetProperty("title").GetString());
        Assert.Equal(1, Total(found));
    }

    [Fact]
    public async Task Estado_de_cuenta_del_mas_nuevo_al_mas_viejo_con_el_saldo_de_cada_fila()
    {
        var merchant = await Merchant.CreateAsync(factory, "led");
        var customerId = (await merchant.PostAsync("/api/v1/customers", new { name = "Gimnasio" })).GetProperty("id").GetGuid();
        // Debe 100, paga 30, debe 50 más: saldo 120.
        foreach (var (kind, amount) in new[] { ("debit", 100_00L), ("credit", 30_00L), ("debit", 50_00L) })
        {
            await merchant.PostAsync("/api/v1/finance/ledger/adjustments", new
            {
                partyKind = "customer",
                partyId = customerId,
                kind,
                amountMinor = amount,
                currency = "ARS",
                reason = "prueba",
            });
        }

        var path = $"/api/v1/finance/ledger?partyKind=customer&partyId={customerId}";
        var first = await merchant.GetAsync($"{path}&limit=2");
        Assert.Equal(120_00, first.GetProperty("balanceMinor").GetInt64());
        Assert.Equal(3, Total(first));
        var newest = Items(first);
        Assert.Equal(2, newest.Count);
        // Lo último que pasó arriba, con el saldo de hoy; la fila de abajo, el
        // saldo de antes de eso.
        Assert.Equal(50_00, newest[0].GetProperty("debitMinor").GetInt64());
        Assert.Equal(120_00, newest[0].GetProperty("balanceMinor").GetInt64());
        Assert.Equal(30_00, newest[1].GetProperty("creditMinor").GetInt64());
        Assert.Equal(70_00, newest[1].GetProperty("balanceMinor").GetInt64());

        // La página siguiente arranca donde terminó esta, aunque sus filas más
        // nuevas no vengan.
        var oldest = Assert.Single(Items(await merchant.GetAsync($"{path}&limit=2&offset=2")));
        Assert.Equal(100_00, oldest.GetProperty("balanceMinor").GetInt64());
    }

    [Fact]
    public async Task Saldos_de_a_una_pagina_con_las_cifras_de_todos()
    {
        var merchant = await Merchant.CreateAsync(factory, "bal");
        foreach (var (name, kind, amount) in new[]
                 {
                     ("Debe mucho", "debit", 900_00L),
                     ("Debe poco", "debit", 100_00L),
                     ("A favor", "credit", 50_00L),
                 })
        {
            var id = (await merchant.PostAsync("/api/v1/customers", new { name })).GetProperty("id").GetGuid();
            await merchant.PostAsync("/api/v1/finance/ledger/adjustments", new
            {
                partyKind = "customer",
                partyId = id,
                kind,
                amountMinor = amount,
                currency = "ARS",
                reason = "saldo inicial",
            });
        }
        // Uno saldado no aparece.
        var settled = (await merchant.PostAsync("/api/v1/customers", new { name = "Al día" })).GetProperty("id").GetGuid();
        foreach (var kind in new[] { "debit", "credit" })
        {
            await merchant.PostAsync("/api/v1/finance/ledger/adjustments", new
            {
                partyKind = "customer",
                partyId = settled,
                kind,
                amountMinor = 10_00L,
                currency = "ARS",
                reason = "ida y vuelta",
            });
        }

        var page = await merchant.GetAsync("/api/v1/finance/balances?partyKind=customer&limit=2");
        Assert.Equal(3, Total(page));
        Assert.Equal(["Debe mucho", "Debe poco"], Items(page).Select(i => i.GetProperty("partyName").GetString()));
        // Lo de arriba de la pantalla es de todos, no de la página.
        Assert.Equal(1_000_00, page.GetProperty("positiveMinor").GetInt64());
        Assert.Equal(-50_00, page.GetProperty("negativeMinor").GetInt64());
        Assert.Equal(950_00, page.GetProperty("totalMinor").GetInt64());

        var last = await merchant.GetAsync("/api/v1/finance/balances?partyKind=customer&limit=2&offset=2");
        Assert.Equal("A favor", Assert.Single(Items(last)).GetProperty("partyName").GetString());
    }

    [Fact]
    public async Task Kits_de_a_una_pagina_y_con_busqueda_por_componente()
    {
        var merchant = await Merchant.CreateAsync(factory, "kit");
        var (_, disc) = await merchant.CreateProductAsync("Disco de goma", stock: 10);
        var (_, bar) = await merchant.CreateProductAsync("Barra olímpica", stock: 10);
        foreach (var (name, component) in new[] { ("Kit inicial", disc), ("Kit pro", bar), ("Kit full", disc) })
        {
            var (_, kit) = await merchant.CreateProductAsync(name, stock: 1);
            await merchant.PutAsync($"/api/v1/products/variants/{kit}/kit",
                new { components = new[] { new { componentVariantId = component, quantity = 2 } } });
        }

        var first = await merchant.GetAsync("/api/v1/products/kits?limit=2");
        Assert.Equal(3, Total(first));
        Assert.Equal(2, Items(first).Count);
        Assert.Single(Items(await merchant.GetAsync("/api/v1/products/kits?limit=2&offset=2")));

        // Buscar por un componente trae los kits que lo usan.
        var withBar = await merchant.GetAsync("/api/v1/products/kits?q=barra");
        Assert.Equal(1, Total(withBar));
        var kitPro = Assert.Single(Items(withBar));
        Assert.StartsWith("Kit pro", kitPro.GetProperty("kitLabel").GetString());

        // Uno solo, por la variante: para saber si lo que se eligió ya es un kit.
        var byId = await merchant.GetAsync($"/api/v1/products/kits?kitVariantId={kitPro.GetProperty("kitVariantId").GetGuid()}");
        Assert.Equal(1, Total(byId));
        Assert.Equal(0, Total(await merchant.GetAsync($"/api/v1/products/kits?kitVariantId={disc}")));
    }

    [Fact]
    public async Task Historial_del_diseno_de_a_una_pagina()
    {
        var merchant = await Merchant.CreateAsync(factory, "thp");
        foreach (var primary in new[] { "1 1 1", "2 2 2", "3 3 3", "4 4 4" })
        {
            await merchant.ExpectOkAsync(HttpMethod.Post, "/api/v1/theme/publish", new
            {
                colors = new { primary, accent = "0 0 0", useAccent = false, bg = "255 255 255", text = "17 24 39" },
                sections = Array.Empty<object>(),
            });
        }

        var all = await merchant.GetAsync("/api/v1/theme/history");
        var total = Total(all);
        Assert.True(total >= 3, $"esperaba al menos 3 versiones, hubo {total}");

        var first = await merchant.GetAsync("/api/v1/theme/history?limit=2");
        Assert.Equal(2, Items(first).Count);
        Assert.Equal(total, Total(first));
        Assert.Equal(total - 2, Items(await merchant.GetAsync("/api/v1/theme/history?limit=2&offset=2")).Count);
    }

    [Fact]
    public async Task Tiendas_del_usuario_de_a_una_pagina_y_con_busqueda()
    {
        var merchant = await Merchant.CreateAsync(factory, "ten");
        var second = await merchant.OpenAnotherStoreAsync("ten2");
        await merchant.OpenAnotherStoreAsync("ten3");

        var page = await merchant.GetAsync("/api/v1/tenants?limit=2");
        Assert.Equal(3, Total(page));
        Assert.Equal(2, Items(page).Count);
        Assert.True(page.GetProperty("hasMore").GetBoolean());
        var rest = await merchant.GetAsync("/api/v1/tenants?limit=2&offset=2");
        Assert.Single(Items(rest));
        Assert.False(rest.GetProperty("hasMore").GetBoolean());
        // Lo que no es de la lista (crear, administrar) sigue llegando igual.
        Assert.True(rest.GetProperty("canCreate").GetBoolean());

        var secondName = (await merchant.GetAsync($"/api/v1/tenants/{second.TenantId}")).GetProperty("name").GetString()!;
        var found = await merchant.GetAsync($"/api/v1/tenants?q={Uri.EscapeDataString(secondName.ToUpperInvariant())}");
        Assert.Equal(second.TenantId, Assert.Single(Items(found)).GetProperty("id").GetGuid());

        // Sin límite, todas (el selector de tienda las quiere a todas).
        Assert.Equal(3, Items(await merchant.GetAsync("/api/v1/tenants")).Count);
        Assert.Equal(HttpStatusCode.OK, (await merchant.SendAsync(HttpMethod.Get, "/api/v1/tenants?limit=100000&offset=-1")).StatusCode);
    }
}
