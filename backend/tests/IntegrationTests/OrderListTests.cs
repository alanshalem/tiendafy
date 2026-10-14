using System.Net;
using System.Text;
using System.Text.Json;

namespace IntegrationTests;

/// <summary>
/// El listado de Ventas del panel: buscar por el número corto que se ve en la
/// tabla, exportar la planilla con los mismos filtros (y solo de esta tienda),
/// marcar varias como enviadas de una vez contando qué pasó con cada una, y
/// la agenda de clientes exportada. Con los permisos de cada cosa.
/// </summary>
[Collection("api")]
public sealed class OrderListTests(ApiFactory factory)
{
    private static string Short(Guid id) => id.ToString("N")[..8].ToUpperInvariant();

    private static async Task<string> CsvAsync(Merchant merchant, string path)
    {
        var res = await merchant.ExpectOkAsync(HttpMethod.Get, path);
        Assert.Equal("text/csv", res.Content.Headers.ContentType?.MediaType);
        var bytes = await res.Content.ReadAsByteArrayAsync();
        // Con BOM: sin él, Excel abre los acentos rotos.
        Assert.True(bytes.AsSpan().StartsWith(Encoding.UTF8.GetPreamble()), "falta el BOM");
        return Encoding.UTF8.GetString(bytes[3..]);
    }

    private static async Task<Guid> SaleAsync(Merchant merchant, string email, string name)
    {
        var (_, variantId) = await merchant.CreateProductAsync($"Producto {Guid.NewGuid():N}"[..20], 12_345_67);
        var order = await merchant.PostAsync("/api/v1/orders/manual", new
        {
            items = new[] { new { variantId, quantity = 2 } },
            paymentMethod = "cash",
            buyerEmail = email,
            buyerName = name,
        });
        return order.GetProperty("id").GetGuid();
    }

    private static Guid[] Ids(JsonElement page) =>
        [.. page.GetProperty("items").EnumerateArray().Select(o => o.GetProperty("id").GetGuid())];

    [Fact]
    public async Task Se_busca_por_el_numero_corto_con_o_sin_numeral()
    {
        var merchant = await Merchant.CreateAsync(factory, "onum");
        var target = await SaleAsync(merchant, "ana@test.local", "Ana");
        var other = await SaleAsync(merchant, "beto@test.local", "Beto");

        foreach (var q in new[] { Short(target), $"#{Short(target)}", Short(target).ToLowerInvariant(), $" #{Short(target)} " })
        {
            var page = await merchant.GetAsync($"/api/v1/orders?limit=25&offset=0&q={Uri.EscapeDataString(q)}");
            Assert.Equal([target], Ids(page));
            Assert.Equal(1, page.GetProperty("total").GetInt32());
        }

        // El filtro de estado sigue andando junto con la búsqueda.
        Assert.Empty(Ids(await merchant.GetAsync($"/api/v1/orders?limit=25&offset=0&status=FULFILLED&q={Short(other)}")));
        Assert.Equal([other], Ids(await merchant.GetAsync($"/api/v1/orders?limit=25&offset=0&status=PAID&q={Short(other)}")));
    }

    [Fact]
    public async Task El_export_trae_lo_filtrado_de_esta_tienda_y_neutraliza_formulas()
    {
        var merchant = await Merchant.CreateAsync(factory, "oexp");
        var ana = await SaleAsync(merchant, "ana@test.local", "Ana; la de \"siempre\"");
        var evil = await SaleAsync(merchant, "evil@test.local", "=HYPERLINK(\"http://x\")");
        await merchant.PostAsync($"/api/v1/orders/{evil}/fulfill", new { tracking = "AR-1" });

        var foreign = await Merchant.CreateAsync(factory, "oexq");
        var foreignSale = await SaleAsync(foreign, "ana@test.local", "Ana de otra tienda");

        var all = await CsvAsync(merchant, "/api/v1/orders/export");
        var lines = all.Split('\n', StringSplitOptions.RemoveEmptyEntries);
        Assert.StartsWith("Número;Fecha;Estado;Cliente;Email", lines[0]);
        Assert.Equal(3, lines.Length);
        Assert.Contains($"#{Short(ana)};", all);
        Assert.DoesNotContain(Short(foreignSale), all);
        // Un ";" o comillas en un nombre no rompen las columnas.
        Assert.Contains("\"Ana; la de \"\"siempre\"\"\"", all);
        // Lo que Excel tomaría como fórmula queda como texto.
        Assert.Contains("\"'=HYPERLINK(\"\"http://x\"\")\"", all);
        Assert.DoesNotContain(";=HYPERLINK", all);
        // Importes con coma decimal: 2 × 12.345,67.
        Assert.Contains("24691,34", all);

        // Los mismos filtros que la pantalla.
        var sent = await CsvAsync(merchant, "/api/v1/orders/export?status=FULFILLED");
        Assert.Contains($"#{Short(evil)}", sent);
        Assert.DoesNotContain($"#{Short(ana)}", sent);
        Assert.Contains("AR-1", sent);
        var searched = await CsvAsync(merchant, $"/api/v1/orders/export?q=%23{Short(ana)}");
        Assert.Equal(2, searched.Split('\n', StringSplitOptions.RemoveEmptyEntries).Length);
    }

    [Fact]
    public async Task Marcar_enviadas_en_lote_cuenta_que_paso_con_cada_una()
    {
        var merchant = await Merchant.CreateAsync(factory, "oblk");
        var first = await SaleAsync(merchant, $"uno-{merchant.Subdomain}@test.local", "Uno");
        var second = await SaleAsync(merchant, $"dos-{merchant.Subdomain}@test.local", "Dos");
        var already = await SaleAsync(merchant, "tres@test.local", "Tres");
        await merchant.PostAsync($"/api/v1/orders/{already}/fulfill", new { tracking = "AR-9" });
        var refunded = await SaleAsync(merchant, "cuatro@test.local", "Cuatro");
        await merchant.PostAsync($"/api/v1/orders/{refunded}/refund", new { amount = (decimal?)null, reason = "test" });

        var foreign = await Merchant.CreateAsync(factory, "oblq");
        var foreignSale = await SaleAsync(foreign, "ajeno@test.local", "Ajeno");

        var res = await merchant.PostAsync("/api/v1/orders/bulk/fulfill",
            new { ids = new[] { first, second, already, refunded, foreignSale, first } });
        Assert.Equal(2, res.GetProperty("fulfilled").GetInt32());
        Assert.Equal(1, res.GetProperty("skipped").GetInt32());
        Assert.Equal(2, res.GetProperty("failed").GetInt32());
        var results = res.GetProperty("results").EnumerateArray()
            .ToDictionary(r => r.GetProperty("id").GetGuid(), r => (Result: r.GetProperty("result").GetString(), Reason: r.GetProperty("reason").GetString()));
        Assert.Equal(5, results.Count); // el repetido cuenta una vez
        Assert.Equal("fulfilled", results[first].Result);
        Assert.Equal("skipped", results[already].Result);
        Assert.Equal("failed", results[refunded].Result);
        Assert.Contains("reembolso", results[refunded].Reason);
        Assert.Equal("failed", results[foreignSale].Result);
        Assert.Contains("no existe", results[foreignSale].Reason);
        Assert.Equal($"#{Short(first)}", res.GetProperty("results").EnumerateArray().First().GetProperty("number").GetString());

        // Quedaron enviadas, con el aviso al comprador; la ajena, intacta.
        Assert.Equal("FULFILLED", (await merchant.GetAsync($"/api/v1/orders/{second}")).GetProperty("status").GetString());
        Assert.Equal("AR-9", (await merchant.GetAsync($"/api/v1/orders/{already}")).GetProperty("tracking").GetString());
        Assert.Equal("PAID", (await foreign.GetAsync($"/api/v1/orders/{foreignSale}")).GetProperty("status").GetString());
        Assert.Contains(factory.ExternalHttp.SentTo(ApiFactory.ResendEmails),
            r => r.Body!.Contains($"dos-{merchant.Subdomain}@test.local") && r.Body.Contains("Despachamos tu pedido"));

        // Sin nada, o con demasiadas: se rechaza antes de tocar nada.
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/orders/bulk/fulfill", new { ids = Array.Empty<Guid>() })).StatusCode);
        var tooMany = Enumerable.Range(0, 101).Select(_ => Guid.NewGuid()).ToArray();
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/orders/bulk/fulfill", new { ids = tooMany })).StatusCode);
    }

    [Fact]
    public async Task Exportar_es_de_quien_ve_y_despachar_en_lote_de_quien_despacha()
    {
        var owner = await Merchant.CreateAsync(factory, "operm");
        var sale = await SaleAsync(owner, "ana@test.local", "Ana");
        var support = await owner.AddTeammateAsync("soporte");
        var catalog = await owner.AddTeammateAsync("catalogo");

        // Soporte ve las ventas y los clientes, pero no despacha.
        Assert.Equal(HttpStatusCode.OK, await support.StatusAsync(HttpMethod.Get, "/api/v1/orders/export"));
        Assert.Equal(HttpStatusCode.OK, await support.StatusAsync(HttpMethod.Get, "/api/v1/customers/export"));
        Assert.Equal(HttpStatusCode.Forbidden, await support.StatusAsync(HttpMethod.Post, "/api/v1/orders/bulk/fulfill", new { ids = new[] { sale } }));
        Assert.Equal("PAID", (await owner.GetAsync($"/api/v1/orders/{sale}")).GetProperty("status").GetString());

        // Catálogo no ve ni ventas ni clientes.
        Assert.Equal(HttpStatusCode.Forbidden, await catalog.StatusAsync(HttpMethod.Get, "/api/v1/orders/export"));
        Assert.Equal(HttpStatusCode.Forbidden, await catalog.StatusAsync(HttpMethod.Get, "/api/v1/customers/export"));
    }

    [Fact]
    public async Task La_agenda_exportada_respeta_la_busqueda_y_la_tienda()
    {
        var merchant = await Merchant.CreateAsync(factory, "cexp");
        await merchant.PostAsync("/api/v1/customers", new { name = "Gimnasio Norte", email = "norte@test.local", phone = "11 5555 0000", address = "Av. Siempreviva 742\n2º B" });
        await merchant.PostAsync("/api/v1/customers", new { name = "+Sur Fitness", email = "sur@test.local" });
        var foreign = await Merchant.CreateAsync(factory, "cexq");
        await foreign.PostAsync("/api/v1/customers", new { name = "Gimnasio Ajeno", email = "ajeno@test.local" });

        var all = await CsvAsync(merchant, "/api/v1/customers/export");
        Assert.StartsWith("Nombre;Email;Teléfono;Dirección;Notas;Alta", all);
        // El teléfono y la dirección se guardan cifrados: el archivo los trae legibles.
        Assert.Contains("11 5555 0000", all);
        Assert.Contains("\"Av. Siempreviva 742\n2º B\"", all);
        Assert.Contains("'+Sur Fitness", all);
        Assert.DoesNotContain("Ajeno", all);

        var searched = await CsvAsync(merchant, "/api/v1/customers/export?q=norte");
        Assert.Contains("Gimnasio Norte", searched);
        Assert.DoesNotContain("Sur Fitness", searched);
    }
}
