using System.Collections.Concurrent;
using System.Net;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Orders.Core.Domain;
using Orders.Infrastructure.Persistence;
using Payments.Core.Domain;

namespace IntegrationTests;

/// <summary>
/// Pedir el pago dos veces sobre la misma compra —doble clic, reintento del
/// navegador, dos pestañas— no crea dos ventas, no reserva el stock dos veces
/// ni cobra dos veces. Una sesión de checkout produce como mucho una orden
/// (índice único en <c>orders.checkout_session_id</c>): el segundo pedido
/// reusa la pendiente o recibe un error claro si ya está pagada. Para cada
/// medio, en secuencia y con los dos pedidos a la vez.
/// </summary>
[Collection("api")]
public sealed class CheckoutDoublePayTests(ApiFactory factory)
{
    private const string MercadoPago = "https://api.mercadopago.com";
    private const string Payway = PaywayConnection.SandboxBaseUrl;

    /// <summary>
    /// Cuánto tarda la pasarela simulada en contestar: deja a los dos pedidos
    /// simultáneos en vuelo al mismo tiempo, que es el caso que se prueba.
    /// </summary>
    private static readonly TimeSpan GatewayDelay = TimeSpan.FromMilliseconds(400);

    // ------------------------------------------------- Transferencia / efectivo

    [Fact]
    public async Task Transferencia_dos_veces_en_secuencia_devuelve_la_misma_venta()
    {
        var (merchant, shopper, variantId) = await TransferStoreAsync("dpt");
        var buyer = $"dpt-{Guid.NewGuid():N}@test.local";
        var checkoutId = await shopper.CheckoutAsync(variantId, quantity: 2, email: buyer);

        var first = await shopper.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/checkout/{checkoutId}/pay-offline", new { method = "transfer" });
        var second = await shopper.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/checkout/{checkoutId}/pay-offline", new { method = "transfer" });

        Assert.Equal(first.GetProperty("orderId").GetGuid(), second.GetProperty("orderId").GetGuid());
        Assert.Equal(first.GetProperty("total").GetProperty("amount").GetInt64(), second.GetProperty("total").GetProperty("amount").GetInt64());
        Assert.Single(await OrdersOfAsync(checkoutId));
        Assert.Equal(3, await merchant.AvailableAsync(variantId)); // 5 − 2, una sola vez
        // Las instrucciones salen una vez: el segundo pedido no repite nada.
        Assert.Single(factory.ExternalHttp.EmailsTo(buyer), m => m.Subject.StartsWith("Cómo pagar tu pedido", StringComparison.Ordinal));

        // Con otro medio sobre la misma compra, no: el monto de la transferencia
        // trae su descuento y la tarjeta no lo tiene.
        var card = await shopper.SendAsync(HttpMethod.Post, $"/api/v1/checkout/{checkoutId}/pay-onsite", Card("tok-dpt"));
        Assert.Equal(HttpStatusCode.Conflict, card.StatusCode);
        Assert.Equal("Checkout.OtherMethod", await CodeAsync(card));

        // Registrado el pago, pedirlo de nuevo dice que ya está pagada.
        await merchant.PostAsync($"/api/v1/orders/{first.GetProperty("orderId").GetGuid()}/mark-paid", new { });
        var again = await shopper.SendAsync(HttpMethod.Post, $"/api/v1/checkout/{checkoutId}/pay-offline", new { method = "transfer" });
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
        Assert.Equal("Checkout.AlreadyPaid", await CodeAsync(again));
        Assert.Single(await OrdersOfAsync(checkoutId));
    }

    [Fact]
    public async Task Transferencia_dos_veces_a_la_vez_crea_una_sola_venta()
    {
        var (merchant, shopper, variantId) = await TransferStoreAsync("dpc");
        var buyer = $"dpc-{Guid.NewGuid():N}@test.local";
        var checkoutId = await shopper.CheckoutAsync(variantId, quantity: 2, email: buyer);

        var responses = await Task.WhenAll(
            shopper.SendAsync(HttpMethod.Post, $"/api/v1/checkout/{checkoutId}/pay-offline", new { method = "transfer" }),
            shopper.SendAsync(HttpMethod.Post, $"/api/v1/checkout/{checkoutId}/pay-offline", new { method = "transfer" }));

        Assert.All(responses, r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));
        var ids = await Task.WhenAll(responses.Select(async r => (await JsonAsync(r)).GetProperty("orderId").GetGuid()));
        Assert.Equal(ids[0], ids[1]);
        Assert.Single(await OrdersOfAsync(checkoutId));
        Assert.Equal(3, await merchant.AvailableAsync(variantId));
        Assert.Single(factory.ExternalHttp.EmailsTo(buyer), m => m.Subject.StartsWith("Cómo pagar tu pedido", StringComparison.Ordinal));
    }

    // ---------------------------------------------------- Mercado Pago, Brick

    [Fact]
    public async Task Tarjeta_en_la_tienda_dos_veces_en_secuencia_no_cobra_dos_veces()
    {
        var (merchant, shopper, variantId) = await MercadoPagoStoreAsync("dpb");
        var payments = FakeMercadoPagoPayments("in_process", delay: TimeSpan.Zero);

        // En revisión: la venta queda pendiente y el reintento recibe el mismo
        // cobro (misma clave de idempotencia, la orden), no uno nuevo.
        var pending = await shopper.CheckoutAsync(variantId);
        var first = await shopper.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/checkout/{pending}/pay-onsite", Card("tok-dpb-1"));
        var second = await shopper.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/checkout/{pending}/pay-onsite", Card("tok-dpb-2"));
        var orderId = first.GetProperty("orderId").GetGuid();
        Assert.Equal(orderId, second.GetProperty("orderId").GetGuid());
        Assert.Equal("in_process", second.GetProperty("status").GetString());
        Assert.Single(await OrdersOfAsync(pending));
        var keys = KeysSentFor(orderId);
        Assert.Equal(2, keys.Count);
        Assert.Single(payments.Values.Distinct()); // Mercado Pago creó un solo pago

        // Aprobado: el reintento dice que ya está pagada, sin ir a Mercado Pago.
        payments = FakeMercadoPagoPayments("approved", delay: TimeSpan.Zero);
        var approvedCheckout = await shopper.CheckoutAsync(variantId);
        var paid = await shopper.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/checkout/{approvedCheckout}/pay-onsite", Card("tok-dpb-3"));
        var paidOrder = paid.GetProperty("orderId").GetGuid();
        var again = await shopper.SendAsync(HttpMethod.Post, $"/api/v1/checkout/{approvedCheckout}/pay-onsite", Card("tok-dpb-4"));
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
        Assert.Equal("Checkout.AlreadyPaid", await CodeAsync(again));
        Assert.Single(KeysSentFor(paidOrder));
        Assert.Equal(98, await merchant.AvailableAsync(variantId)); // la pendiente reservó 1 y la pagada descontó 1
    }

    [Fact]
    public async Task Tarjeta_en_la_tienda_dos_veces_a_la_vez_cobra_una_vez()
    {
        var (merchant, shopper, variantId) = await MercadoPagoStoreAsync("dpk");
        var payments = FakeMercadoPagoPayments("approved", GatewayDelay);
        var buyer = $"dpk-{Guid.NewGuid():N}@test.local";
        var checkoutId = await shopper.CheckoutAsync(variantId, email: buyer);

        var responses = await Task.WhenAll(
            shopper.SendAsync(HttpMethod.Post, $"/api/v1/checkout/{checkoutId}/pay-onsite", Card("tok-dpk-1")),
            shopper.SendAsync(HttpMethod.Post, $"/api/v1/checkout/{checkoutId}/pay-onsite", Card("tok-dpk-2")));

        var order = Assert.Single(await OrdersOfAsync(checkoutId));
        Assert.Equal(OrderStatus.Paid, order.Status);
        // Uno cobra; el otro recibe el mismo cobro o "ya está pagada", nunca un error del servidor.
        Assert.Contains(responses, r => r.StatusCode == HttpStatusCode.OK);
        Assert.All(responses, r => Assert.True(r.StatusCode is HttpStatusCode.OK or HttpStatusCode.Conflict, r.StatusCode.ToString()));
        Assert.All(KeysSentFor(order.Id), key => Assert.Equal(order.Id.ToString(), key));
        Assert.Single(payments.Values.Distinct());
        // Pagada una vez: el stock se descuenta y la confirmación sale una sola vez.
        Assert.Equal(99, await merchant.AvailableAsync(variantId));
        Assert.Single(factory.ExternalHttp.EmailsTo(buyer), m => m.Subject.StartsWith("Confirmamos tu pago", StringComparison.Ordinal));
    }

    // ------------------------------------------------ Mercado Pago, Checkout Pro

    [Fact]
    public async Task Checkout_Pro_dos_veces_devuelve_la_misma_venta_y_el_mismo_link()
    {
        var (_, shopper, variantId) = await MercadoPagoStoreAsync("dpp");
        FakePreferences(TimeSpan.Zero);

        var checkoutId = await shopper.CheckoutAsync(variantId);
        var first = await shopper.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/checkout/{checkoutId}/pay", new { returnUrl = shopper.ReturnUrl });
        var second = await shopper.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/checkout/{checkoutId}/pay", new { returnUrl = shopper.ReturnUrl });
        var orderId = first.GetProperty("orderId").GetGuid();
        Assert.Equal(orderId, second.GetProperty("orderId").GetGuid());
        Assert.Equal(first.GetProperty("initPoint").GetString(), second.GetProperty("initPoint").GetString());
        var order = Assert.Single(await OrdersOfAsync(checkoutId));
        Assert.Equal($"pref-{orderId:N}"[..30], order.PreferenceId);
        Assert.All(PreferenceKeysFor(orderId), key => Assert.Equal(orderId.ToString(), key));

        // A la vez.
        FakePreferences(GatewayDelay);
        var concurrent = await shopper.CheckoutAsync(variantId);
        var responses = await Task.WhenAll(
            shopper.SendAsync(HttpMethod.Post, $"/api/v1/checkout/{concurrent}/pay", new { returnUrl = shopper.ReturnUrl }),
            shopper.SendAsync(HttpMethod.Post, $"/api/v1/checkout/{concurrent}/pay", new { returnUrl = shopper.ReturnUrl }));
        Assert.All(responses, r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));
        var bodies = await Task.WhenAll(responses.Select(JsonAsync));
        Assert.Equal(bodies[0].GetProperty("orderId").GetGuid(), bodies[1].GetProperty("orderId").GetGuid());
        Assert.Equal(bodies[0].GetProperty("initPoint").GetString(), bodies[1].GetProperty("initPoint").GetString());
        var concurrentOrder = Assert.Single(await OrdersOfAsync(concurrent));
        Assert.NotNull(concurrentOrder.PreferenceId);
    }

    // ------------------------------------------------------------------ Payway

    [Fact]
    public async Task Payway_dos_veces_en_secuencia_no_cobra_dos_veces()
    {
        var (_, shopper, variantId) = await PaywayStoreAsync("dpw");

        // En revisión del antifraude: el reintento recibe ese mismo resultado y
        // a Payway no le llega otro cobro.
        var reviewPayment = Random.Shared.NextInt64(10_000_000, 99_999_999);
        factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Payway}/payments",
            new { id = reviewPayment, status = "review", amount = 20_000_00 }, HttpStatusCode.Created);
        var review = await shopper.CheckoutAsync(variantId);
        var first = await shopper.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/checkout/{review}/pay-payway", PaywayCard("tok-dpw-1"));
        var second = await shopper.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/checkout/{review}/pay-payway", PaywayCard("tok-dpw-2"));
        Assert.Equal("UNDERREVIEW", first.GetProperty("status").GetString());
        Assert.Equal("UNDERREVIEW", second.GetProperty("status").GetString());
        Assert.Equal(first.GetProperty("orderId").GetGuid(), second.GetProperty("orderId").GetGuid());
        Assert.Single(await OrdersOfAsync(review));
        Assert.Empty(PaywayChargesWith("tok-dpw-2"));

        // Aprobado: el reintento dice que ya está pagada.
        factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Payway}/payments",
            PaywayApproved(Random.Shared.NextInt64(10_000_000, 99_999_999)), HttpStatusCode.Created);
        var approved = await shopper.CheckoutAsync(variantId);
        await shopper.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/checkout/{approved}/pay-payway", PaywayCard("tok-dpw-3"));
        var again = await shopper.SendAsync(HttpMethod.Post, $"/api/v1/checkout/{approved}/pay-payway", PaywayCard("tok-dpw-4"));
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
        Assert.Equal("Checkout.AlreadyPaid", await CodeAsync(again));
        Assert.Empty(PaywayChargesWith("tok-dpw-4"));

        // Rechazado: como con Mercado Pago, la orden queda fallida (el stock ya
        // volvió). Reintentar sobre la misma compra no le llega a Payway; otra
        // tarjeta es otra compra (ver PaywayFlowTests).
        factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Payway}/payments", new
        {
            id = Random.Shared.NextInt64(10_000_000, 99_999_999),
            status = "rejected",
            amount = 20_000_00,
            status_details = new { error = new { type = "insufficient_amount", reason = new { id = 51, description = "FONDOS INSUFICIENTES" } } },
        }, HttpStatusCode.PaymentRequired);
        var declined = await shopper.CheckoutAsync(variantId);
        var no = await shopper.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/checkout/{declined}/pay-payway", PaywayCard("tok-dpw-5"));
        Assert.Equal("DECLINED", no.GetProperty("status").GetString());
        var retry = await shopper.SendAsync(HttpMethod.Post, $"/api/v1/checkout/{declined}/pay-payway", PaywayCard("tok-dpw-6"));
        Assert.Equal(HttpStatusCode.Conflict, retry.StatusCode);
        Assert.Equal("Checkout.PaymentFailed", await CodeAsync(retry));
        Assert.Empty(PaywayChargesWith("tok-dpw-6"));
    }

    [Fact]
    public async Task Payway_dos_veces_a_la_vez_cobra_una_vez()
    {
        var (merchant, shopper, variantId) = await PaywayStoreAsync("dpy");
        var payment = Random.Shared.NextInt64(10_000_000, 99_999_999);
        factory.ExternalHttp.On(HttpMethod.Post, $"{Payway}/payments", (_, _) =>
        {
            Thread.Sleep(GatewayDelay);
            return FakeHttp.Json(PaywayApproved(payment), HttpStatusCode.Created);
        });
        var checkoutId = await shopper.CheckoutAsync(variantId);

        var responses = await Task.WhenAll(
            shopper.SendAsync(HttpMethod.Post, $"/api/v1/checkout/{checkoutId}/pay-payway", PaywayCard("tok-dpy-1")),
            shopper.SendAsync(HttpMethod.Post, $"/api/v1/checkout/{checkoutId}/pay-payway", PaywayCard("tok-dpy-2")));

        var order = Assert.Single(await OrdersOfAsync(checkoutId));
        Assert.Equal(OrderStatus.Paid, order.Status);
        Assert.Contains(responses, r => r.StatusCode == HttpStatusCode.OK);
        Assert.All(responses, r => Assert.True(r.StatusCode is HttpStatusCode.OK or HttpStatusCode.Conflict, r.StatusCode.ToString()));
        // Un solo cobro a Payway, entre los dos tokens.
        Assert.Single(PaywayChargesWith("tok-dpy-"));
        Assert.Equal(99, await merchant.AvailableAsync(variantId));
    }

    // ---------------------------------------------------------------- helpers

    private async Task<(Merchant, Shopper, Guid)> TransferStoreAsync(string tag)
    {
        var merchant = await Merchant.CreateAsync(factory, tag);
        await merchant.PutAsync("/api/v1/admin/payments/options", new
        {
            transferEnabled = true,
            discountPercent = 10,
            bankName = "Banco Nación",
            accountHolder = "Tienda de Test SRL",
            holderTaxId = "30-71234567-8",
            cbu = "0110599520000012345678",
            alias = "TIENDA.TEST.PAGOS",
            holdHours = 48,
            cashOnPickupEnabled = true,
            installmentsMax = 0,
        });
        var (_, variantId) = await merchant.CreateProductAsync("Mate doble", priceMinor: 10_000_00, stock: 5);
        return (merchant, new Shopper(merchant), variantId);
    }

    private async Task<(Merchant, Shopper, Guid)> MercadoPagoStoreAsync(string tag)
    {
        var merchant = await Merchant.CreateAsync(factory, tag);
        await merchant.ConnectMercadoPagoAsync(Random.Shared.NextInt64(1_000_000, 9_000_000_000));
        var (_, variantId) = await merchant.CreateProductAsync("Buzo doble", priceMinor: 30_000_00, stock: 100);
        return (merchant, new Shopper(merchant), variantId);
    }

    private async Task<(Merchant, Shopper, Guid)> PaywayStoreAsync(string tag)
    {
        var merchant = await Merchant.CreateAsync(factory, tag);
        await merchant.PutAsync("/api/v1/payments/payway/connection", new
        {
            siteId = "00290815",
            environment = "SANDBOX",
            publicKey = "pub-key",
            privateKey = "priv-key",
            establishmentName = "TIENDA TEST",
            installmentOptions = new[] { 1, 3, 6 },
        });
        var (_, variantId) = await merchant.CreateProductAsync("Reloj doble", priceMinor: 20_000_00, stock: 100);
        return (merchant, new Shopper(merchant), variantId);
    }

    /// <summary>
    /// Mercado Pago simulado con su idempotencia: la misma X-Idempotency-Key
    /// devuelve el mismo pago, una nueva crea otro. Devuelve qué pago le tocó a
    /// cada clave.
    /// </summary>
    private ConcurrentDictionary<string, long> FakeMercadoPagoPayments(string status, TimeSpan delay)
    {
        var byKey = new ConcurrentDictionary<string, long>();
        factory.ExternalHttp.On(HttpMethod.Post, $"{MercadoPago}/v1/payments", (req, _) =>
        {
            Thread.Sleep(delay);
            var key = req.Headers.GetValues("X-Idempotency-Key").Single();
            var id = byKey.GetOrAdd(key, _ => Random.Shared.NextInt64(100_000_000, 999_999_999));
            return FakeHttp.Json(new { id, status, status_detail = status == "approved" ? "accredited" : "pending_contingency" },
                HttpStatusCode.Created);
        });
        return byKey;
    }

    /// <summary>Preferences simuladas con idempotencia: la misma clave (la orden) devuelve la misma.</summary>
    private void FakePreferences(TimeSpan delay) =>
        factory.ExternalHttp.On(HttpMethod.Post, $"{MercadoPago}/checkout/preferences", (req, _) =>
        {
            Thread.Sleep(delay);
            var key = Guid.Parse(req.Headers.GetValues("X-Idempotency-Key").Single());
            var id = $"pref-{key:N}"[..30];
            return FakeHttp.Json(new { id, init_point = $"https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id={id}" },
                HttpStatusCode.Created);
        });

    private List<string> KeysSentFor(Guid orderId) =>
        [.. factory.ExternalHttp.SentTo($"{MercadoPago}/v1/payments")
            .Where(r => r.Method == HttpMethod.Post && r.Body?.Contains(orderId.ToString()) == true)
            .Select(r => r.Headers["X-Idempotency-Key"])];

    private List<string> PreferenceKeysFor(Guid orderId) =>
        [.. factory.ExternalHttp.SentTo($"{MercadoPago}/checkout/preferences")
            .Where(r => r.Body?.Contains(orderId.ToString()) == true)
            .Select(r => r.Headers["X-Idempotency-Key"])];

    private List<FakeHttp.Recorded> PaywayChargesWith(string tokenPrefix) =>
        [.. factory.ExternalHttp.SentTo($"{Payway}/payments")
            .Where(r => r.Method == HttpMethod.Post && r.Body?.Contains($"\"token\":\"{tokenPrefix}") == true)];

    private static object Card(string token) => new { token, paymentMethodId = "visa", installments = 1 };

    private static object PaywayCard(string token) => new
    {
        token,
        bin = "450799",
        installments = 1,
        cardLastFour = "4905",
        cardBrand = (string?)null,
        isDebit = false,
    };

    private static object PaywayApproved(long id) => new
    {
        id,
        status = "approved",
        amount = 20_000_00,
        tid = "TID-1",
        status_details = new { card_authorization_code = "AUT123", ticket = "7" },
    };

    private async Task<List<Order>> OrdersOfAsync(Guid checkoutSessionId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<OrdersDbContext>();
        return await db.Orders.IgnoreQueryFilters().AsNoTracking()
            .Where(o => o.CheckoutSessionId == checkoutSessionId).ToListAsync();
    }

    private static async Task<JsonElement> JsonAsync(HttpResponseMessage res) =>
        await res.Content.ReadFromJsonAsync<JsonElement>(Merchant.Json);

    private static async Task<string?> CodeAsync(HttpResponseMessage res) =>
        (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("title").GetString();
}
