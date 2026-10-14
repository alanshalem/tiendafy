using System.Net;
using System.Text.Json;

namespace IntegrationTests;

/// <summary>
/// La cuenta del comprador más allá del login: sus direcciones guardadas (que
/// nadie más puede leer ni tocar), el detalle de cada pedido propio, y los
/// datos legales que la tienda muestra en el pie y debajo de los precios.
/// </summary>
[Collection("api")]
public sealed class ShopAccountTests(ApiFactory factory)
{
    private static object Address(string street, bool isDefault = false) => new
    {
        label = "Casa",
        name = "Ana",
        lastName = "Pérez",
        phone = "1155556666",
        doc = "30111222",
        street,
        streetNumber = "1234",
        apartment = "3B",
        city = "CABA",
        province = "Ciudad Autónoma de Buenos Aires",
        zip = "1414",
        isDefault,
    };

    private static async Task<Shopper> RegisteredAsync(Merchant merchant, string email)
    {
        var shopper = new Shopper(merchant);
        await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/shop/auth/register",
            new { name = "Ana Pérez", email, password = "una-clave-larga" });
        return shopper;
    }

    private static Guid[] Ids(JsonElement list) =>
        [.. list.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("id").GetGuid())];

    [Fact]
    public async Task Direcciones_guardadas_por_comprador_con_una_predeterminada()
    {
        var merchant = await Merchant.CreateAsync(factory, "dir");
        var ana = await RegisteredAsync(merchant, $"ana-{merchant.Subdomain}@test.local");
        var beto = await RegisteredAsync(merchant, $"beto-{merchant.Subdomain}@test.local");

        Assert.Equal(HttpStatusCode.Unauthorized, (await new Shopper(merchant).SendAsync(HttpMethod.Get, "/api/v1/shop/addresses/")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await ana.SendAsync(HttpMethod.Post, "/api/v1/shop/addresses/",
            new { name = "Ana", street = "", streetNumber = "1", city = "CABA", zip = "1414" })).StatusCode);

        // La primera queda predeterminada sola; la segunda, solo si se pide.
        var casa = (await ana.ExpectJsonAsync(HttpMethod.Post, "/api/v1/shop/addresses/", Address("Corrientes"))).GetProperty("id").GetGuid();
        var trabajo = (await ana.ExpectJsonAsync(HttpMethod.Post, "/api/v1/shop/addresses/", Address("Florida"))).GetProperty("id").GetGuid();
        var list = await ana.ExpectJsonAsync(HttpMethod.Get, "/api/v1/shop/addresses/");
        Assert.Equal([casa, trabajo], Ids(list));
        var first = list.GetProperty("items")[0];
        Assert.True(first.GetProperty("isDefault").GetBoolean());
        Assert.Equal("Corrientes", first.GetProperty("street").GetString());
        Assert.Equal("1414", first.GetProperty("zip").GetString());

        // Cambiar la predeterminada y editar.
        await ana.ExpectOkAsync(HttpMethod.Post, $"/api/v1/shop/addresses/{trabajo}/default");
        Assert.Equal([trabajo, casa], Ids(await ana.ExpectJsonAsync(HttpMethod.Get, "/api/v1/shop/addresses/")));
        var edited = await ana.ExpectJsonAsync(HttpMethod.Put, $"/api/v1/shop/addresses/{casa}", Address("Santa Fe"));
        Assert.Equal("Santa Fe", edited.GetProperty("street").GetString());

        // Otro comprador de la misma tienda no ve, no edita ni borra las de Ana.
        Assert.Empty(Ids(await beto.ExpectJsonAsync(HttpMethod.Get, "/api/v1/shop/addresses/")));
        Assert.Equal(HttpStatusCode.NotFound, (await beto.SendAsync(HttpMethod.Put, $"/api/v1/shop/addresses/{casa}", Address("Robada"))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await beto.SendAsync(HttpMethod.Post, $"/api/v1/shop/addresses/{casa}/default")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await beto.SendAsync(HttpMethod.Delete, $"/api/v1/shop/addresses/{casa}")).StatusCode);
        Assert.Equal(2, Ids(await ana.ExpectJsonAsync(HttpMethod.Get, "/api/v1/shop/addresses/")).Length);

        // Borrar la predeterminada pasa la marca a la que queda.
        Assert.Equal(HttpStatusCode.NoContent, (await ana.SendAsync(HttpMethod.Delete, $"/api/v1/shop/addresses/{trabajo}")).StatusCode);
        var left = await ana.ExpectJsonAsync(HttpMethod.Get, "/api/v1/shop/addresses/");
        Assert.Equal([casa], Ids(left));
        Assert.True(left.GetProperty("items")[0].GetProperty("isDefault").GetBoolean());
    }

    [Fact]
    public async Task El_detalle_de_un_pedido_es_solo_de_quien_lo_compro()
    {
        var merchant = await Merchant.CreateAsync(factory, "det");
        var email = $"ana-{merchant.Subdomain}@test.local";
        var orderId = await merchant.CreateSaleAsync(buyerEmail: email);
        var ana = await RegisteredAsync(merchant, email);
        var beto = await RegisteredAsync(merchant, $"beto-{merchant.Subdomain}@test.local");

        var detail = await ana.ExpectJsonAsync(HttpMethod.Get, $"/api/v1/shop/orders/{orderId}");
        Assert.Equal(1001, detail.GetProperty("number").GetInt32());
        Assert.False(detail.GetProperty("invoiceAvailable").GetBoolean());
        Assert.Equal(1001, (await ana.ExpectJsonAsync(HttpMethod.Get, "/api/v1/shop/orders")).GetProperty("items")[0].GetProperty("number").GetInt32());

        Assert.Equal(HttpStatusCode.NotFound, (await beto.SendAsync(HttpMethod.Get, $"/api/v1/shop/orders/{orderId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await beto.SendAsync(HttpMethod.Get, $"/api/v1/shop/orders/{orderId}/invoice.pdf")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await ana.SendAsync(HttpMethod.Get, $"/api/v1/shop/orders/{orderId}/invoice.pdf")).StatusCode);
    }

    [Fact]
    public async Task Datos_legales_por_defecto_y_editados()
    {
        var merchant = await Merchant.CreateAsync(factory, "legal");
        var shopper = new Shopper(merchant);

        // Sin cargar nada: Responsable Inscripto al 21 %, leyenda encendida.
        var initial = await shopper.ExpectJsonAsync(HttpMethod.Get, "/api/v1/store/legal");
        var price = initial.GetProperty("priceWithoutTaxes");
        Assert.True(price.GetProperty("show").GetBoolean());
        Assert.Equal(1.21m, price.GetProperty("divisor").GetDecimal());

        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Put, "/api/v1/admin/store-legal/", new
        {
            cuit = "20-12345678-0",
            condition = "RESPONSABLE_INSCRIPTO",
            showPriceWithoutTaxes = true,
        })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Put, "/api/v1/admin/store-legal/", new
        {
            condition = "RESPONSABLE_INSCRIPTO",
            showPriceWithoutTaxes = true,
            dataFiscalUrl = "javascript:alert(1)",
        })).StatusCode);

        await merchant.PutAsync("/api/v1/admin/store-legal/", new
        {
            legalName = "Importadora Test S.A.",
            cuit = "30-71234567-1",
            address = "Av. Corrientes 1234, CABA",
            condition = "MONOTRIBUTO",
            vatRatePercent = 21m,
            otherNationalTaxesPercent = 0m,
            showPriceWithoutTaxes = true,
            dataFiscalUrl = "https://servicios1.afip.gov.ar/clavefiscal/qr/response.aspx?qr=abc",
        });

        var shown = await shopper.ExpectJsonAsync(HttpMethod.Get, "/api/v1/store/legal");
        Assert.Equal("Importadora Test S.A.", shown.GetProperty("legalName").GetString());
        Assert.Equal("30-71234567-1", shown.GetProperty("cuit").GetString());
        Assert.Equal("MONOTRIBUTO", shown.GetProperty("priceWithoutTaxes").GetProperty("condition").GetString());
        // Monotributo no discrimina IVA: el precio ya es el neto.
        Assert.Equal(1m, shown.GetProperty("priceWithoutTaxes").GetProperty("divisor").GetDecimal());
    }
}
