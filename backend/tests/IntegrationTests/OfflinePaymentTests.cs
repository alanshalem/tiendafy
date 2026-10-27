using System.Net;
using System.Text.Json;
using Api.Orders;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Orders.Infrastructure.Persistence;

namespace IntegrationTests;

/// <summary>
/// La transferencia y el envío gratis que anuncia la tienda, cumplidos de
/// verdad: el descuento lo calcula el servidor (lo que mande el navegador no
/// cuenta), el comercio registra el pago o la venta se cancela sola al vencer
/// el plazo, y "gratis desde $X" pone el envío en cero al cobrar.
/// </summary>
[Collection("api")]
public sealed class OfflinePaymentTests(ApiFactory factory)
{
    private static object TransferOptions(int discountPercent = 10, bool cash = false) => new
    {
        transferEnabled = true,
        discountPercent,
        bankName = "Banco Nación",
        accountHolder = "Tienda de Test SRL",
        holderTaxId = "30-71234567-8",
        cbu = "0110599520000012345678",
        alias = "TIENDA.TEST.PAGOS",
        instructions = "Mandanos el comprobante por WhatsApp.",
        holdHours = 48,
        cashOnPickupEnabled = cash,
        installmentsMax = 6,
        installmentsNote = "Con tarjetas de crédito bancarias.",
    };

    private async Task<JsonElement> StockAsync(Merchant merchant, Guid variantId) =>
        (await merchant.GetAsync($"/api/v1/inventory?variantIds={variantId}")).GetProperty("items").EnumerateArray().Single();

    [Fact]
    public async Task La_transferencia_aplica_el_descuento_del_servidor_y_guarda_el_stock()
    {
        var merchant = await Merchant.CreateAsync(factory, "tra");
        await merchant.PutAsync("/api/v1/admin/payments/options", TransferOptions(discountPercent: 10));
        var (_, variantId) = await merchant.CreateProductAsync("Mate", priceMinor: 10_000_00, stock: 5);
        var envio = (await merchant.PostAsync("/api/v1/admin/shipping/methods",
            new { name = "Moto", kind = "delivery", price = 1_500m })).GetProperty("id").GetGuid();
        await merchant.PostAsync("/api/v1/coupons", new
        {
            code = "TRA10",
            type = "percent",
            value = 10,
            minPurchase = 0L,
            active = true,
        });

        var shopper = new Shopper(merchant);
        var email = $"transfer-{merchant.Subdomain}@test.local";
        var checkoutId = await shopper.CheckoutAsync(variantId, quantity: 2, shippingMethodId: envio, address: "San Martín 100", email: email);

        // El navegador "manda" un total y un descuento inventados: no se leen.
        var placed = await shopper.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/checkout/{checkoutId}/pay-offline", new
        {
            method = "transfer",
            couponCode = "TRA10",
            total = 1,
            discount = 99_999_99,
            discountPercent = 90,
        });

        // 2 × 10.000 = 20.000 → cupón 10% = 2.000 → transferencia 10% sobre
        // 18.000 = 1.800 → productos 16.200 + envío 1.500 (sin descuento).
        Assert.Equal("transfer", placed.GetProperty("method").GetString());
        Assert.Equal("PENDINGPAYMENT", placed.GetProperty("status").GetString());
        Assert.Equal(17_700_00, placed.GetProperty("total").GetProperty("amount").GetInt64());
        Assert.Equal(1_800_00, placed.GetProperty("discount").GetProperty("amount").GetInt64());
        Assert.Equal("TIENDA.TEST.PAGOS", placed.GetProperty("transfer").GetProperty("alias").GetString());
        var orderId = placed.GetProperty("orderId").GetGuid();

        var order = await merchant.GetAsync($"/api/v1/orders/{orderId}");
        Assert.Equal("transfer", order.GetProperty("paymentProvider").GetString());
        Assert.Equal(3_800_00, order.GetProperty("discount").GetProperty("amount").GetInt64());
        Assert.Equal(1_800_00, order.GetProperty("paymentMethodDiscount").GetProperty("amount").GetInt64());
        var due = order.GetProperty("paymentDueAtUtc").GetDateTime();
        Assert.InRange(due, DateTime.UtcNow.AddHours(47), DateTime.UtcNow.AddHours(49));

        // El stock queda reservado más allá de la media hora del checkout.
        Assert.Equal(2, (await StockAsync(merchant, variantId)).GetProperty("reserved").GetInt32());
        using (var scope = factory.Services.CreateScope())
        {
            var inventory = scope.ServiceProvider.GetRequiredService<Inventory.Infrastructure.Persistence.InventoryDbContext>();
            var reservations = await inventory.Reservations.IgnoreQueryFilters().AsNoTracking()
                .Where(r => r.VariantId == variantId && r.Status == Inventory.Core.Domain.ReservationStatus.Active).ToListAsync();
            Assert.All(reservations, r => Assert.True(r.ExpiresAtUtc > DateTime.UtcNow.AddHours(48)));
        }

        // La pantalla de "listo" puede volver a pedir cómo pagar, sin sesión.
        var summary = await shopper.ExpectJsonAsync(HttpMethod.Get, $"/api/v1/orders/{orderId}/summary");
        var how = summary.GetProperty("paymentInstructions");
        Assert.Equal("Datos para transferir", how.GetProperty("title").GetString());
        Assert.Contains("0110599520000012345678", how.GetProperty("text").GetString());

        // Y el comprador recibe los datos por email.
        Assert.Contains(factory.ExternalHttp.SentTo(ApiFactory.ResendEmails),
            r => r.Body!.Contains(email) && r.Body.Contains("TIENDA.TEST.PAGOS") && r.Body.Contains("Descuento por transferencia"));
    }

    [Fact]
    public async Task Registrar_el_pago_confirma_la_venta_y_descuenta_el_stock()
    {
        var merchant = await Merchant.CreateAsync(factory, "trp");
        await merchant.PutAsync("/api/v1/admin/payments/options", TransferOptions());
        var (_, variantId) = await merchant.CreateProductAsync("Termo", priceMinor: 30_000_00, stock: 3);
        var shopper = new Shopper(merchant);
        var email = $"pagado-{merchant.Subdomain}@test.local";
        var checkoutId = await shopper.CheckoutAsync(variantId, email: email);
        var orderId = (await shopper.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/checkout/{checkoutId}/pay-offline",
            new { method = "transfer" })).GetProperty("orderId").GetGuid();

        var paid = await merchant.PostAsync($"/api/v1/orders/{orderId}/mark-paid", new { });
        Assert.Equal("PAID", paid.GetProperty("status").GetString());
        Assert.Equal("manual-transfer", paid.GetProperty("paymentId").GetString());

        var stock = await StockAsync(merchant, variantId);
        Assert.Equal(2, stock.GetProperty("available").GetInt32());
        Assert.Equal(0, stock.GetProperty("reserved").GetInt32());
        Assert.Contains(factory.ExternalHttp.SentTo(ApiFactory.ResendEmails),
            r => r.Body!.Contains(email) && r.Body.Contains("Confirmamos tu pago"));

        // Doble clic: no pasa nada dos veces.
        await merchant.PostAsync($"/api/v1/orders/{orderId}/mark-paid", new { });
        Assert.Equal(2, (await StockAsync(merchant, variantId)).GetProperty("available").GetInt32());

        // Una venta pagada ya no se cancela desde acá (se devuelve con un reembolso).
        Assert.Equal(HttpStatusCode.Conflict,
            (await merchant.SendAsync(HttpMethod.Post, $"/api/v1/orders/{orderId}/cancel", new { })).StatusCode);
    }

    [Fact]
    public async Task Una_transferencia_que_no_llega_se_cancela_sola_y_devuelve_el_stock()
    {
        var merchant = await Merchant.CreateAsync(factory, "trv");
        await merchant.PutAsync("/api/v1/admin/payments/options", TransferOptions());
        var (_, variantId) = await merchant.CreateProductAsync("Bombilla", priceMinor: 5_000_00, stock: 4);
        var shopper = new Shopper(merchant);
        var buyer = $"vencida-{merchant.Subdomain}@test.local";
        var checkoutId = await shopper.CheckoutAsync(variantId, quantity: 3, email: buyer);
        var orderId = (await shopper.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/checkout/{checkoutId}/pay-offline",
            new { method = "transfer" })).GetProperty("orderId").GetGuid();
        Assert.Equal(1, (await StockAsync(merchant, variantId)).GetProperty("available").GetInt32());

        // Antes del plazo, el worker no la toca.
        await Workers.RunOnceAsync<OfflinePaymentExpiryWorker>(factory);
        Assert.Equal("PENDINGPAYMENT", (await merchant.GetAsync($"/api/v1/orders/{orderId}")).GetProperty("status").GetString());

        await ExpireAsync(orderId);

        await Workers.RunOnceAsync<OfflinePaymentExpiryWorker>(factory);
        Assert.Equal("CANCELLED", (await merchant.GetAsync($"/api/v1/orders/{orderId}")).GetProperty("status").GetString());
        var stock = await StockAsync(merchant, variantId);
        Assert.Equal(4, stock.GetProperty("available").GetInt32());
        Assert.Equal(0, stock.GetProperty("reserved").GetInt32());

        // Vencida, ya no se puede registrar el pago (el stock volvió a la venta).
        Assert.Equal(HttpStatusCode.Conflict,
            (await merchant.SendAsync(HttpMethod.Post, $"/api/v1/orders/{orderId}/mark-paid", new { })).StatusCode);

        // Y una segunda pasada no la procesa de nuevo.
        await Workers.RunOnceAsync<OfflinePaymentExpiryWorker>(factory);
        Assert.Equal(4, (await StockAsync(merchant, variantId)).GetProperty("available").GetInt32());

        // Al comprador le llega el aviso aunque la plantilla de cancelación esté
        // apagada (como viene de fábrica), una sola vez, y le dice por qué.
        var mail = Assert.Single(factory.ExternalHttp.EmailsTo(buyer),
            m => m.Subject.StartsWith("Se venció el plazo para pagar tu pedido #", StringComparison.Ordinal));
        Assert.Contains("no registramos el pago dentro del plazo", mail.Html, StringComparison.Ordinal);
        Assert.Contains("Si ya pagaste", mail.Html, StringComparison.Ordinal);
    }

    /// <summary>
    /// Con la plantilla "Cancelación de compra" prendida, la venta que vence
    /// sola avisa con el texto de la tienda (como la cancelación a mano), y no
    /// además con el de fábrica.
    /// </summary>
    [Fact]
    public async Task La_transferencia_vencida_avisa_con_la_plantilla_de_la_tienda_si_esta_prendida()
    {
        var merchant = await Merchant.CreateAsync(factory, "trw");
        await merchant.PutAsync("/api/v1/admin/payments/options", TransferOptions());
        await merchant.PutAsync("/api/v1/email-templates/cancelacion-compra", new
        {
            enabled = true,
            subject = "Anulamos tu pedido #{{order_id}}",
            bodyHtml = "<p>{{name}}, el pedido quedó sin efecto.</p>",
        });
        var (_, variantId) = await merchant.CreateProductAsync("Matera", priceMinor: 9_000_00, stock: 2);
        var shopper = new Shopper(merchant);
        var buyer = $"vencida-propia-{merchant.Subdomain}@test.local";
        var checkoutId = await shopper.CheckoutAsync(variantId, email: buyer);
        var orderId = (await shopper.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/checkout/{checkoutId}/pay-offline",
            new { method = "transfer" })).GetProperty("orderId").GetGuid();

        await ExpireAsync(orderId);
        await Workers.RunOnceAsync<OfflinePaymentExpiryWorker>(factory);
        await Workers.RunOnceAsync<OfflinePaymentExpiryWorker>(factory);

        var mail = Assert.Single(factory.ExternalHttp.EmailsTo(buyer),
            m => m.Subject.StartsWith("Anulamos tu pedido #", StringComparison.Ordinal));
        Assert.Contains("el pedido quedó sin efecto", mail.Html, StringComparison.Ordinal);
        Assert.DoesNotContain(factory.ExternalHttp.EmailsTo(buyer),
            m => m.Subject.StartsWith("Se venció el plazo", StringComparison.Ordinal));
    }

    /// <summary>Pone el plazo de pago de la venta en el pasado: la próxima pasada del worker la vence.</summary>
    private async Task ExpireAsync(Guid orderId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<OrdersDbContext>();
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE orders SET payment_due_at_utc = {DateTime.UtcNow.AddMinutes(-1)} WHERE id = {orderId}");
    }

    [Fact]
    public async Task Sin_configurar_no_hay_transferencia_y_el_efectivo_es_solo_para_retirar()
    {
        var merchant = await Merchant.CreateAsync(factory, "trn");
        var (_, variantId) = await merchant.CreateProductAsync("Yerba", priceMinor: 4_000_00, stock: 10);
        var delivery = (await merchant.PostAsync("/api/v1/admin/shipping/methods",
            new { name = "Moto", kind = "delivery", price = 0m })).GetProperty("id").GetGuid();
        var pickup = (await merchant.PostAsync("/api/v1/admin/shipping/methods",
            new { name = "Retiro", kind = "pickup", price = 0m, pickupAddress = "Av. Corrientes 1234" })).GetProperty("id").GetGuid();
        var shopper = new Shopper(merchant);

        var offers = await shopper.ExpectJsonAsync(HttpMethod.Get, "/api/v1/store-offers");
        Assert.False(offers.GetProperty("configured").GetBoolean());
        Assert.False(offers.GetProperty("canCheckout").GetBoolean());

        var first = await shopper.CheckoutAsync(variantId, shippingMethodId: delivery, address: "Calle 1");
        Assert.Equal(HttpStatusCode.BadRequest, (await shopper.SendAsync(HttpMethod.Post,
            $"/api/v1/checkout/{first}/pay-offline", new { method = "transfer" })).StatusCode);

        await merchant.PutAsync("/api/v1/admin/payments/options", TransferOptions(discountPercent: 5, cash: true));
        offers = await shopper.ExpectJsonAsync(HttpMethod.Get, "/api/v1/store-offers");
        Assert.True(offers.GetProperty("configured").GetBoolean());
        Assert.Equal(5, offers.GetProperty("transfer").GetProperty("discountPercent").GetInt32());
        Assert.Equal(6, offers.GetProperty("installments").GetProperty("max").GetInt32());
        Assert.True(offers.GetProperty("canCheckout").GetBoolean());

        // Efectivo con envío a domicilio: no.
        var withDelivery = await shopper.CheckoutAsync(variantId, shippingMethodId: delivery, address: "Calle 1");
        Assert.Equal(HttpStatusCode.BadRequest, (await shopper.SendAsync(HttpMethod.Post,
            $"/api/v1/checkout/{withDelivery}/pay-offline", new { method = "cash" })).StatusCode);

        // Efectivo al retirar: sí, con el mismo descuento y la dirección del local.
        var withPickup = await shopper.CheckoutAsync(variantId, shippingMethodId: pickup);
        var placed = await shopper.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/checkout/{withPickup}/pay-offline", new { method = "cash" });
        Assert.Equal("cash", placed.GetProperty("method").GetString());
        Assert.Equal(3_800_00, placed.GetProperty("total").GetProperty("amount").GetInt64());
        Assert.Equal("Av. Corrientes 1234", placed.GetProperty("pickupAddress").GetString());
        Assert.Equal(JsonValueKind.Null, placed.GetProperty("transfer").ValueKind);

        // Una venta de Mercado Pago/Payway pendiente no se "paga" a mano.
        var manual = await merchant.CreateSaleAsync();
        Assert.Equal(HttpStatusCode.Conflict,
            (await merchant.SendAsync(HttpMethod.Post, $"/api/v1/orders/{manual}/mark-paid", new { })).StatusCode);
    }

    [Fact]
    public async Task El_envio_gratis_desde_un_monto_se_aplica_al_cobrar()
    {
        var merchant = await Merchant.CreateAsync(factory, "egr");
        await merchant.PutAsync("/api/v1/admin/payments/options", TransferOptions(discountPercent: 0));
        var (_, cheap) = await merchant.CreateProductAsync("Llavero", priceMinor: 5_000_00, stock: 10);
        var (_, pricey) = await merchant.CreateProductAsync("Campera", priceMinor: 60_000_00, stock: 10);
        var moto = (await merchant.PostAsync("/api/v1/admin/shipping/methods",
            new { name = "Moto", kind = "delivery", price = 2_000m, freeAbove = 50_000m })).GetProperty("id").GetGuid();
        await merchant.PostAsync("/api/v1/admin/shipping/methods",
            new { name = "Correo", kind = "delivery", price = 3_000m, freeAbove = 80_000m });
        var shopper = new Shopper(merchant);

        // La barra del carrito promete el umbral más bajo de los medios activos.
        var offers = await shopper.ExpectJsonAsync(HttpMethod.Get, "/api/v1/store-offers");
        Assert.Equal(50_000_00, offers.GetProperty("freeShipping").GetProperty("from").GetProperty("amount").GetInt64());
        Assert.Equal("Moto", offers.GetProperty("freeShipping").GetProperty("methodName").GetString());
        var methods = await shopper.ExpectJsonAsync(HttpMethod.Get, "/api/v1/shipping/methods");
        Assert.Contains(methods.GetProperty("items").EnumerateArray(),
            m => m.GetProperty("name").GetString() == "Moto" && m.GetProperty("freeAbove").GetProperty("amount").GetInt64() == 50_000_00);

        // Debajo del umbral se cobra el envío…
        var below = await shopper.CheckoutAsync(cheap, shippingMethodId: moto, address: "Calle 1");
        var belowOrder = await shopper.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/checkout/{below}/pay-offline", new { method = "transfer" });
        Assert.Equal(7_000_00, belowOrder.GetProperty("total").GetProperty("amount").GetInt64());

        // …y desde el umbral, no: lo decide el servidor con su subtotal.
        var above = await shopper.CheckoutAsync(pricey, shippingMethodId: moto, address: "Calle 1");
        var session = await shopper.ExpectJsonAsync(HttpMethod.Get, $"/api/v1/checkout/{above}");
        Assert.Equal(0, session.GetProperty("shipping").GetProperty("amount").GetInt64());
        var aboveOrder = await shopper.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/checkout/{above}/pay-offline", new { method = "transfer" });
        Assert.Equal(60_000_00, aboveOrder.GetProperty("total").GetProperty("amount").GetInt64());
    }

    [Fact]
    public async Task Las_opciones_de_pago_validan_lo_que_se_carga()
    {
        var merchant = await Merchant.CreateAsync(factory, "trx");
        // Prender la transferencia sin cuenta no se puede.
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Put, "/api/v1/admin/payments/options", new
        {
            transferEnabled = true,
            discountPercent = 10,
            accountHolder = "X",
            holdHours = 24,
            cashOnPickupEnabled = false,
            installmentsMax = 0,
        })).StatusCode);
        // Un CBU tiene 22 números.
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Put, "/api/v1/admin/payments/options", new
        {
            transferEnabled = true,
            discountPercent = 10,
            accountHolder = "X",
            cbu = "123",
            holdHours = 24,
            cashOnPickupEnabled = false,
            installmentsMax = 0,
        })).StatusCode);

        var saved = await merchant.PutAsync("/api/v1/admin/payments/options", TransferOptions(discountPercent: 15));
        Assert.True(saved.GetProperty("configured").GetBoolean());
        Assert.Equal(15, saved.GetProperty("discountPercent").GetInt32());
        Assert.Equal("0110599520000012345678", saved.GetProperty("cbu").GetString());
    }
}
