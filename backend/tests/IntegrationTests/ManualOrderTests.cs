using System.Net;
using System.Text.Json;

namespace IntegrationTests;

/// <summary>
/// La venta manual (mostrador, WhatsApp, teléfono): lo que rechaza antes de
/// tocar el stock, que nunca deja reservas colgadas cuando algo falla a mitad
/// de camino, cada forma de cobro (efectivo, transferencia, cuenta corriente
/// y link de Mercado Pago) y lo que queda escrito en la orden.
/// </summary>
[Collection("api")]
public sealed class ManualOrderTests(ApiFactory factory)
{
    private const string MercadoPago = "https://api.mercadopago.com";

    /// <summary>Una venta de una variante; <paramref name="extra"/> agrega o pisa campos del pedido.</summary>
    private static Dictionary<string, object?> Sale(
        Guid variantId, string paymentMethod, int quantity = 1, Dictionary<string, object?>? extra = null)
    {
        var body = new Dictionary<string, object?>
        {
            ["items"] = new[] { new { variantId, quantity } },
            ["paymentMethod"] = paymentMethod,
            ["buyerEmail"] = "cliente@test.local",
            ["buyerName"] = "Cliente de mostrador",
        };
        foreach (var (key, value) in extra ?? []) body[key] = value;
        return body;
    }

    private static async Task<string?> CodeAsync(HttpResponseMessage res) =>
        (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("title").GetString();

    [Fact]
    public async Task Rechaza_lo_invalido_sin_reservar_stock()
    {
        var merchant = await Merchant.CreateAsync(factory, "mo1");
        var (_, variant) = await merchant.CreateProductAsync("Mancuerna", priceMinor: 20_000_00, stock: 3);
        async Task<string?> Reject(object body)
        {
            var res = await merchant.SendAsync(HttpMethod.Post, "/api/v1/orders/manual", body);
            Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
            return await CodeAsync(res);
        }

        Assert.Equal("Order.Empty", await Reject(new { items = Array.Empty<object>(), paymentMethod = "cash" }));
        Assert.Equal("Order.DuplicateItem", await Reject(new
        {
            items = new[] { new { variantId = variant, quantity = 1 }, new { variantId = variant, quantity = 2 } },
            paymentMethod = "cash",
        }));
        Assert.Equal("Order.UnknownVariant", await Reject(Sale(Guid.NewGuid(), "cash")));
        Assert.Equal("Order.BadQuantity", await Reject(Sale(variant, "cash", quantity: 0)));
        Assert.Equal("Order.BadPayment", await Reject(Sale(variant, "cheque")));
        Assert.Equal("Order.LinkNeedsEmail", await Reject(new { items = new[] { new { variantId = variant, quantity = 1 } }, paymentMethod = "link" }));
        Assert.Equal("Order.BadReturnUrl", await Reject(Sale(variant, "link", extra: new() { ["returnUrl"] = "https://phishing.example" })));
        // A cuenta corriente sin cliente: una deuda sin deudor.
        Assert.Equal("Order.CustomerRequired", await Reject(Sale(variant, "cuenta_corriente")));

        Assert.Equal(3, await merchant.AvailableAsync(variant));
    }

    [Fact]
    public async Task Sin_stock_de_uno_libera_lo_que_ya_habia_reservado()
    {
        var merchant = await Merchant.CreateAsync(factory, "mo2");
        var (_, plenty) = await merchant.CreateProductAsync("Banda elástica", stock: 10);
        var (_, scarce) = await merchant.CreateProductAsync("Rueda abdominal", stock: 1);

        var res = await merchant.SendAsync(HttpMethod.Post, "/api/v1/orders/manual", new
        {
            items = new[] { new { variantId = plenty, quantity = 4 }, new { variantId = scarce, quantity = 2 } },
            paymentMethod = "cash",
        });
        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
        Assert.Contains("Rueda abdominal", (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("detail").GetString());
        Assert.Equal(10, await merchant.AvailableAsync(plenty));
        Assert.Equal(1, await merchant.AvailableAsync(scarce));
    }

    [Fact]
    public async Task Transferencia_y_cuenta_corriente_nacen_pagadas_con_su_forma_de_cobro()
    {
        var merchant = await Merchant.CreateAsync(factory, "mo3");
        var (_, variant) = await merchant.CreateProductAsync("Colchoneta", priceMinor: 15_000_00, stock: 10);
        var customer = await merchant.PostAsync("/api/v1/customers", new { name = "Gimnasio Norte", email = "norte@test.local" });

        var transfer = await merchant.PostAsync("/api/v1/orders/manual", Sale(variant, "transfer", extra: new()
        {
            ["shippingCostMinor"] = 2_000_00,
            ["shippingMethodName"] = "Moto",
            ["shippingAddress"] = "Av. Siempreviva 742",
            ["notes"] = "  entregar a la tarde  ",
        }));
        Assert.Equal("PAID", transfer.GetProperty("status").GetString());
        Assert.Equal(17_000_00, transfer.GetProperty("total").GetInt64());
        var detail = await merchant.GetAsync($"/api/v1/orders/{transfer.GetProperty("id").GetGuid()}");
        Assert.Contains("Venta manual (Transferencia) · entregar a la tarde", detail.ToString(), StringComparison.Ordinal);

        var onAccount = await merchant.PostAsync("/api/v1/orders/manual",
            Sale(variant, "cuenta_corriente", quantity: 2, extra: new() { ["customerId"] = customer.GetProperty("id").GetGuid() }));
        Assert.Equal("PAID", onAccount.GetProperty("status").GetString());
        var account = await merchant.GetAsync($"/api/v1/orders/{onAccount.GetProperty("id").GetGuid()}");
        Assert.Contains("Cuenta corriente", account.ToString(), StringComparison.Ordinal);
        Assert.Equal(7, await merchant.AvailableAsync(variant));
    }

    [Fact]
    public async Task Link_de_Mercado_Pago_deja_la_orden_pendiente_con_el_link_para_mandar()
    {
        var merchant = await Merchant.CreateAsync(factory, "mo4");
        await merchant.ConnectMercadoPagoAsync(Random.Shared.NextInt64(1_000_000, 9_000_000_000));
        var (_, variant) = await merchant.CreateProductAsync("Kettlebell", priceMinor: 30_000_00, stock: 5);
        var returnUrl = $"http://{merchant.Subdomain}.localhost:3000";

        // Mercado Pago caído: no hay link, y la reserva se libera.
        factory.ExternalHttp.OnJson(HttpMethod.Post, $"{MercadoPago}/v1/checkout/preferences", new { message = "boom" }, HttpStatusCode.InternalServerError);
        var down = await merchant.SendAsync(HttpMethod.Post, "/api/v1/orders/manual", Sale(variant, "link", extra: new() { ["returnUrl"] = returnUrl }));
        Assert.False(down.IsSuccessStatusCode);
        Assert.Equal(5, await merchant.AvailableAsync(variant));

        factory.ExternalHttp.OnJson(HttpMethod.Post, $"{MercadoPago}/v1/checkout/preferences",
            new { id = "pref-manual", init_point = "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-manual" });
        var sale = await merchant.PostAsync("/api/v1/orders/manual", Sale(variant, "link", quantity: 2, extra: new() { ["returnUrl"] = returnUrl }));
        Assert.Equal("PENDINGPAYMENT", sale.GetProperty("status").GetString());
        Assert.Contains("pref-manual", sale.GetProperty("paymentLink").GetString());

        var preference = factory.ExternalHttp.SentTo($"{MercadoPago}/v1/checkout/preferences").Last().Body!;
        Assert.Contains("Kettlebell", preference, StringComparison.Ordinal);
        Assert.Contains($"{returnUrl}/checkout/success?order={sale.GetProperty("id").GetGuid()}", preference, StringComparison.Ordinal);
        Assert.Equal(3, await merchant.AvailableAsync(variant)); // reservado hasta que pague
    }
}
