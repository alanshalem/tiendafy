using System.Net;
using System.Text.Json;

namespace IntegrationTests;

/// <summary>
/// El camino completo de una venta mayorista contra la API real: lista de
/// precios → presupuesto al precio de esa lista → aceptarlo en cuenta corriente
/// → la deuda del cliente.
///
/// Son cuatro features que se construyeron por separado y solo sirven si
/// encajan. Cada una tiene sus tests propios; este prueba que la costura
/// aguanta, que es donde se rompen las cosas.
/// </summary>
[Collection("api")]
public sealed class QuoteToSaleTests
{
    private readonly ApiFactory _factory;

    public QuoteToSaleTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task De_la_lista_mayorista_al_presupuesto_y_de_ahi_a_la_cuenta_corriente()
    {
        var merchant = await Merchant.CreateAsync(_factory, "quo");

        // Un producto de $100.000.
        var variantId = (await merchant.CreateProductAsync("Mancuerna 10kg", 100_000_00)).VariantId;

        // Lista mayorista: 30% menos.
        var list = await merchant.PostAsync("/api/v1/price-lists",
            new { name = "Mayorista", currency = "ARS", adjustmentPercent = -30, rounding = "none" });
        var listId = list.GetProperty("id").GetGuid();

        // Un cliente con esa lista asignada.
        var customer = await merchant.PostAsync("/api/v1/customers",
            new { name = "Gimnasio del Centro", email = $"{merchant.Subdomain}@gym.test", priceListId = listId });
        var customerId = customer.GetProperty("id").GetGuid();

        // El precio que le toca sale de la lista, no del producto.
        var prices = await merchant.GetAsync($"/api/v1/quotes/prices?customerId={customerId}&variantIds={variantId}");
        Assert.Equal(listId, prices.GetProperty("priceListApplied").GetGuid());
        var unitPrice = prices.GetProperty("items").EnumerateArray().Single().GetProperty("priceMinor").GetInt64();
        Assert.Equal(70_000_00, unitPrice);

        // Presupuesto por 5 unidades a ese precio.
        var quote = await merchant.PostAsync("/api/v1/quotes",
            new
            {
                customerName = "Gimnasio del Centro",
                customerId,
                customerEmail = $"{merchant.Subdomain}@gym.test",
                currency = "ARS",
                validUntilUtc = DateTime.UtcNow.Date.AddDays(15),
                items = new[] { new { variantId, quantity = 5, unitPriceMinor = unitPrice } },
            });
        var quoteId = quote.GetProperty("id").GetGuid();
        Assert.Equal("PRE-0001", quote.GetProperty("number").GetString());
        Assert.Equal(350_000_00, quote.GetProperty("totalMinor").GetInt64());
        Assert.Equal("draft", quote.GetProperty("status").GetString());

        await merchant.PostAsync($"/api/v1/quotes/{quoteId}/send", new { });

        // Antes de aceptarlo no hay ninguna deuda.
        var balances = await merchant.GetAsync("/api/v1/finance/balances?partyKind=customer");
        Assert.Empty(balances.GetProperty("items").EnumerateArray());

        // Lo acepta: nace la venta, en cuenta corriente.
        var accepted = await merchant.PostAsync($"/api/v1/quotes/{quoteId}/accept",
            new { paymentMethod = "cuenta_corriente" });
        var orderId = accepted.GetProperty("orderId").GetGuid();
        Assert.Equal("accepted", accepted.GetProperty("quote").GetProperty("status").GetString());
        Assert.Equal(orderId, accepted.GetProperty("quote").GetProperty("convertedOrderId").GetGuid());

        // La venta quedó al precio del presupuesto, no al del producto.
        var order = await merchant.GetAsync($"/api/v1/orders/{orderId}");
        Assert.Equal(350_000_00, order.GetProperty("total").GetProperty("amount").GetInt64());

        // Y el cliente nos debe exactamente eso.
        var ledger = await merchant.GetAsync($"/api/v1/finance/ledger?partyKind=customer&partyId={customerId}");
        Assert.Equal(350_000_00, ledger.GetProperty("balanceMinor").GetInt64());
        Assert.Equal("Gimnasio del Centro", ledger.GetProperty("partyName").GetString());

        // Aceptarlo dos veces no duplica la venta ni la deuda.
        var again = await merchant.SendAsync(HttpMethod.Post, $"/api/v1/quotes/{quoteId}/accept",
            new { paymentMethod = "cuenta_corriente" });
        Assert.Equal(HttpStatusCode.BadRequest, again.StatusCode);

        ledger = await merchant.GetAsync($"/api/v1/finance/ledger?partyKind=customer&partyId={customerId}");
        Assert.Equal(350_000_00, ledger.GetProperty("balanceMinor").GetInt64());
    }

    [Fact]
    public async Task Un_presupuesto_sin_cliente_no_se_puede_cerrar_en_cuenta_corriente()
    {
        var merchant = await Merchant.CreateAsync(_factory, "qnc");
        var variantId = (await merchant.CreateProductAsync("Barra olímpica", 200_000_00)).VariantId;

        // Se cotiza a nombre de alguien que todavía no está en la agenda: vale,
        // porque a un cliente nuevo se le cotiza antes de darlo de alta.
        var quote = await merchant.PostAsync("/api/v1/quotes",
            new
            {
                customerName = "Cliente nuevo",
                currency = "ARS",
                validUntilUtc = DateTime.UtcNow.Date.AddDays(10),
                items = new[] { new { variantId, quantity = 1, unitPriceMinor = 200_000_00L } },
            });
        var quoteId = quote.GetProperty("id").GetGuid();

        // Pero fiarle sin ficha dejaría una deuda sin deudor.
        var res = await merchant.SendAsync(HttpMethod.Post, $"/api/v1/quotes/{quoteId}/accept",
            new { paymentMethod = "cuenta_corriente" });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);

        // En efectivo sí se cierra.
        var ok = await merchant.PostAsync($"/api/v1/quotes/{quoteId}/accept", new { paymentMethod = "cash" });
        Assert.Equal("accepted", ok.GetProperty("quote").GetProperty("status").GetString());
    }

    [Fact]
    public async Task Un_presupuesto_rechazado_se_reabre_antes_de_volver_a_ofrecerlo()
    {
        var merchant = await Merchant.CreateAsync(_factory, "qrj");
        var variantId = (await merchant.CreateProductAsync("Disco 20kg", 80_000_00)).VariantId;

        var quote = await merchant.PostAsync("/api/v1/quotes",
            new
            {
                customerName = "Cliente indeciso",
                currency = "ARS",
                validUntilUtc = DateTime.UtcNow.Date.AddDays(10),
                items = new[] { new { variantId, quantity = 2, unitPriceMinor = 80_000_00L } },
            });
        var quoteId = quote.GetProperty("id").GetGuid();

        await merchant.PostAsync($"/api/v1/quotes/{quoteId}/reject",
            new { reason = "Consiguieron mejor precio" });

        var rejected = await merchant.GetAsync($"/api/v1/quotes/{quoteId}");
        Assert.Equal("rejected", rejected.GetProperty("status").GetString());
        Assert.False(rejected.GetProperty("editable").GetBoolean());

        var blocked = await merchant.SendAsync(HttpMethod.Post, $"/api/v1/quotes/{quoteId}/accept", new { paymentMethod = "cash" });
        Assert.Equal(HttpStatusCode.BadRequest, blocked.StatusCode);

        await merchant.PostAsync($"/api/v1/quotes/{quoteId}/reopen", new { });
        var reopened = await merchant.GetAsync($"/api/v1/quotes/{quoteId}");
        Assert.Equal("draft", reopened.GetProperty("status").GetString());
        Assert.Null(reopened.GetProperty("rejectionReason").GetString());

        // El resumen cuenta la conversión sobre los decididos, no sobre el total.
        var summary = await merchant.GetAsync("/api/v1/quotes/summary");
        Assert.Equal(1, summary.GetProperty("total").GetInt32());
        Assert.Equal(1, summary.GetProperty("open").GetInt32());
        Assert.Equal(0, summary.GetProperty("accepted").GetInt32());
    }
}
