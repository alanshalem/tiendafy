using System.Collections.Concurrent;
using System.Net;
using System.Web;
using Api.Payments;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Payments.Contracts;
using Payments.Core.Domain;
using Payments.Infrastructure.Persistence;
using SharedKernel.Common;

namespace IntegrationTests;

/// <summary>
/// Payway (ex Decidir) de punta a punta, con su API simulada en
/// <see cref="FakeHttp"/>: configurar → cobrar → rechazos → el cobro que no
/// contesta.
///
/// <para>
/// Payway no tiene idempotencia: un cobro que se reintenta es un cobro doble.
/// Por eso lo más importante acá es el timeout —no se reintenta: se le
/// pregunta a Payway por nuestro id de operación y se adopta lo que diga— y
/// que una orden ya cobrada no se pueda volver a cobrar.
/// </para>
/// </summary>
[Collection("api")]
public sealed class PaywayFlowTests
{
    private const string Sandbox = PaywayConnection.SandboxBaseUrl;
    private readonly ApiFactory _factory;

    public PaywayFlowTests(ApiFactory factory) => _factory = factory;

    private static object Config(string? privateKey = "priv-key", string? baseUrlOverride = null) => new
    {
        siteId = "00290815",
        environment = "SANDBOX",
        publicKey = "pub-key",
        privateKey,
        baseUrlOverride,
        establishmentName = "TIENDA TEST",
        installmentOptions = new[] { 1, 3, 6 },
    };

    private static object Card(string token = "tok-1", string bin = "450799", int installments = 3) => new
    {
        token,
        bin,
        installments,
        cardLastFour = "4905",
        cardBrand = (string?)null,
        isDebit = false,
    };

    private static object Approved(long id, long amount) => new
    {
        id,
        status = "approved",
        amount,
        tid = "TID-1",
        status_details = new { card_authorization_code = "AUT123", ticket = "7" },
    };

    [Fact]
    public async Task Configurar_cobrar_y_no_cobrar_dos_veces()
    {
        var merchant = await Merchant.CreateAsync(_factory, "pw");
        var shopper = new Shopper(merchant);

        // Sin configurar: el storefront no ofrece Payway.
        Assert.False((await merchant.GetAsync("/api/v1/payments/payway/connection")).GetProperty("connected").GetBoolean());
        Assert.False((await shopper.ExpectJsonAsync(HttpMethod.Get, "/api/v1/payments/payway/public-config")).GetProperty("enabled").GetBoolean());

        // La primera vez la clave privada es obligatoria; el host alternativo, HTTPS.
        Assert.Equal(HttpStatusCode.BadRequest,
            (await merchant.SendAsync(HttpMethod.Put, "/api/v1/payments/payway/connection", Config(privateKey: null))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await merchant.SendAsync(HttpMethod.Put, "/api/v1/payments/payway/connection", Config(baseUrlOverride: "http://inseguro.test"))).StatusCode);

        var saved = await merchant.PutAsync("/api/v1/payments/payway/connection", Config());
        Assert.Equal(Sandbox, saved.GetProperty("baseUrl").GetString());
        var connection = await merchant.GetAsync("/api/v1/payments/payway/connection");
        Assert.True(connection.GetProperty("hasPrivateKey").GetBoolean());
        Assert.DoesNotContain("priv-key", connection.ToString());
        // Editar sin clave privada conserva la guardada.
        await merchant.PutAsync("/api/v1/payments/payway/connection", Config(privateKey: ""));

        var publicConfig = await shopper.ExpectJsonAsync(HttpMethod.Get, "/api/v1/payments/payway/public-config");
        Assert.Equal("pub-key", publicConfig.GetProperty("publicKey").GetString());
        Assert.Equal(3, publicConfig.GetProperty("installmentOptions").GetArrayLength());

        // Probar la conexión: el healthcheck de Payway.
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Sandbox}/healthcheck", new { name = "payments", version = "2" });
        Assert.True((await merchant.PostAsync("/api/v1/payments/payway/test", new { })).GetProperty("ok").GetBoolean());

        // Cobrar.
        var (_, variantId) = await merchant.CreateProductAsync("Zapatilla Payway", priceMinor: 45_000_00);
        var checkoutId = await shopper.CheckoutAsync(variantId);

        Assert.Equal(HttpStatusCode.BadRequest, (await shopper.SendAsync(HttpMethod.Post,
            $"/api/v1/checkout/{checkoutId}/pay-payway", new { token = "", bin = "" })).StatusCode);

        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Sandbox}/payments", Approved(9_100_001, 45_000_00), HttpStatusCode.Created);
        var paid = await shopper.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/checkout/{checkoutId}/pay-payway", Card());
        Assert.Equal("APPROVED", paid.GetProperty("status").GetString());
        Assert.Equal("AUT123", paid.GetProperty("authorizationCode").GetString());
        var orderId = paid.GetProperty("orderId").GetGuid();
        Assert.Equal("PAID", (await shopper.ExpectJsonAsync(HttpMethod.Get, $"/api/v1/orders/{orderId}/status")).GetProperty("status").GetString());

        var charge = _factory.ExternalHttp.SentTo($"{Sandbox}/payments").Last(r => r.Method == HttpMethod.Post);
        Assert.Equal("priv-key", charge.Headers["apikey"]);
        Assert.Contains("\"amount\":4500000", charge.Body); // en centavos, como lo guarda la orden
        Assert.Contains("\"payment_method_id\":1", charge.Body); // Visa crédito, deducido del BIN
        Assert.Contains("TIENDA TEST", charge.Body);

        // La API pública del servicio: consultar y devolver.
        await using (var scope = _factory.Services.CreateTenantScope(merchant.TenantId))
        {
            var payway = scope.ServiceProvider.GetRequiredService<IPaywayPaymentService>();
            var tenant = new TenantId(merchant.TenantId);

            _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Sandbox}/payments/9100001", Approved(9_100_001, 45_000_00));
            var found = await payway.GetPaymentAsync(tenant, "9100001");
            Assert.Equal(PaywayPaymentStatus.Approved, found.Value.Status);

            _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Sandbox}/payments/9100001/refunds",
                new { id = 77, amount = 10_000_00L, status = "approved" });
            var refund = await payway.RefundAsync(tenant, "9100001", 10_000_00);
            Assert.Equal(10_000_00, refund.Value.AmountMinor);

            _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Sandbox}/payments/9100001/refunds", new { error = "x" }, HttpStatusCode.BadRequest);
            Assert.True((await payway.RefundAsync(tenant, "9100001", null)).IsFailure);

            _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Sandbox}/payments/404", new { }, HttpStatusCode.NotFound);
            Assert.True((await payway.GetPaymentAsync(tenant, "404")).IsFailure);
        }

        // Borrar la conexión: el storefront deja de ofrecerlo.
        await merchant.ExpectOkAsync(HttpMethod.Delete, "/api/v1/payments/payway/connection");
        await merchant.ExpectOkAsync(HttpMethod.Delete, "/api/v1/payments/payway/connection");
        Assert.Equal(HttpStatusCode.BadRequest,
            (await merchant.SendAsync(HttpMethod.Post, "/api/v1/payments/payway/test")).StatusCode);
    }

    [Fact]
    public async Task Rechazos_token_repetido_y_timeout()
    {
        var merchant = await Merchant.CreateAsync(_factory, "pwr");
        var shopper = new Shopper(merchant);
        await merchant.PutAsync("/api/v1/payments/payway/connection", Config());
        var (_, variantId) = await merchant.CreateProductAsync("Campera Payway", priceMinor: 80_000_00);

        // Fondos insuficientes (402): es un resultado, con un motivo para el comprador.
        var declinedCheckout = await shopper.CheckoutAsync(variantId);
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Sandbox}/payments", new
        {
            id = 9_200_001,
            status = "rejected",
            amount = 80_000_00,
            status_details = new { error = new { type = "insufficient_amount", reason = new { id = 51, description = "FONDOS INSUFICIENTES" } } },
        }, HttpStatusCode.PaymentRequired);
        var declined = await shopper.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/checkout/{declinedCheckout}/pay-payway", Card());
        Assert.Equal("DECLINED", declined.GetProperty("status").GetString());
        Assert.True(declined.GetProperty("retryable").GetBoolean());
        Assert.False(string.IsNullOrEmpty(declined.GetProperty("message").GetString()));

        // Token ya usado: el comprador reenvió el formulario.
        var repeatedCheckout = await shopper.CheckoutAsync(variantId);
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Sandbox}/payments", new
        {
            error_type = "invalid_request_error",
            validation_errors = new[] { new { code = "repeated", param = "token" } },
        }, HttpStatusCode.BadRequest);
        var repeated = await shopper.SendAsync(HttpMethod.Post, $"/api/v1/checkout/{repeatedCheckout}/pay-payway", Card());
        Assert.Equal(HttpStatusCode.Conflict, repeated.StatusCode); // culpa del pedido, no del servidor
        Assert.Contains("ya se usaron", await repeated.Content.ReadAsStringAsync());

        // Credenciales malas y Payway caído.
        foreach (var (status, expected) in new[] { (HttpStatusCode.Unauthorized, "credenciales"), (HttpStatusCode.BadGateway, "no está disponible") })
        {
            var checkout = await shopper.CheckoutAsync(variantId);
            _factory.ExternalHttp.On(HttpMethod.Post, $"{Sandbox}/payments", (_, _) => new HttpResponseMessage(status));
            var res = await shopper.SendAsync(HttpMethod.Post, $"/api/v1/checkout/{checkout}/pay-payway", Card());
            Assert.Contains(expected, await res.Content.ReadAsStringAsync());
        }

        // Timeout: no se reintenta. Se busca la operación por nuestro id y,
        // si Payway la cobró, se adopta.
        var timeoutCheckout = await shopper.CheckoutAsync(variantId);
        _factory.ExternalHttp.On(HttpMethod.Post, $"{Sandbox}/payments", (_, _) => throw new HttpRequestException("timeout simulado"));
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Sandbox}/payments?siteOperationId=",
            new { results = new[] { Approved(9_300_001, 80_000_00) } });
        var recovered = await shopper.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/checkout/{timeoutCheckout}/pay-payway", Card("tok-timeout"));
        Assert.Equal("APPROVED", recovered.GetProperty("status").GetString());

        // Y si Payway tampoco la encuentra: "no sabemos", sin cobrar de nuevo.
        var lostCheckout = await shopper.CheckoutAsync(variantId);
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Sandbox}/payments?siteOperationId=", new { results = Array.Empty<object>() });
        var lost = await shopper.SendAsync(HttpMethod.Post, $"/api/v1/checkout/{lostCheckout}/pay-payway", Card("tok-lost"));
        Assert.Contains("No vuelvas a intentar", await lost.Content.ReadAsStringAsync());
        Assert.Single(_factory.ExternalHttp.SentTo($"{Sandbox}/payments"), r => r.Body?.Contains("tok-lost") == true);
    }

    [Fact]
    public async Task Un_rechazo_libera_el_stock_y_otra_tarjeta_es_otra_compra()
    {
        var merchant = await Merchant.CreateAsync(_factory, "pwx");
        var shopper = new Shopper(merchant);
        await merchant.PutAsync("/api/v1/payments/payway/connection", Config());
        // La última unidad: con la rechazada reteniéndola, el reintento no tenía stock.
        var (_, variantId) = await merchant.CreateProductAsync("Lámpara Payway", priceMinor: 25_000_00, stock: 1);

        var first = await shopper.CheckoutAsync(variantId);
        Assert.Equal(0, await merchant.AvailableAsync(variantId));
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Sandbox}/payments", new
        {
            id = Random.Shared.NextInt64(10_000_000, 99_999_999),
            status = "rejected",
            amount = 25_000_00,
            status_details = new { error = new { type = "insufficient_amount", reason = new { id = 51, description = "FONDOS INSUFICIENTES" } } },
        }, HttpStatusCode.PaymentRequired);
        var declined = await shopper.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/checkout/{first}/pay-payway", Card("tok-x-1"));
        Assert.Equal("DECLINED", declined.GetProperty("status").GetString());
        var declinedOrder = declined.GetProperty("orderId").GetGuid();

        // Como un rechazo de Mercado Pago: la venta no queda pendiente y la
        // unidad vuelve a la venta en el momento, no cuando vence la reserva.
        Assert.Equal("FAILED", await StatusAsync(shopper, declinedOrder));
        Assert.Equal(1, await merchant.AvailableAsync(variantId));

        // Otra tarjeta: la tienda arma otra compra, con otra orden y otro
        // site_transaction_id (Payway no tiene idempotencia y el token es de un uso).
        var second = await shopper.CheckoutAsync(variantId);
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Sandbox}/payments", Approved(9_500_001, 25_000_00), HttpStatusCode.Created);
        var paid = await shopper.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/checkout/{second}/pay-payway", Card("tok-x-2"));
        Assert.Equal("APPROVED", paid.GetProperty("status").GetString());
        var paidOrder = paid.GetProperty("orderId").GetGuid();
        Assert.NotEqual(declinedOrder, paidOrder);
        Assert.Equal(0, await merchant.AvailableAsync(variantId));

        var charges = _factory.ExternalHttp.SentTo($"{Sandbox}/payments")
            .Where(r => r.Method == HttpMethod.Post && r.Body?.Contains("tok-x-") == true).ToList();
        Assert.Equal(2, charges.Count);
        Assert.Contains(PaywayPaymentAttempt.BuildSiteTransactionId(declinedOrder, 1), charges[0].Body);
        Assert.Contains(PaywayPaymentAttempt.BuildSiteTransactionId(paidOrder, 1), charges[1].Body);
    }

    [Fact]
    public async Task Solo_se_cobra_en_las_cuotas_que_ofrece_la_tienda()
    {
        var merchant = await Merchant.CreateAsync(_factory, "pwc");
        var shopper = new Shopper(merchant);
        await merchant.PutAsync("/api/v1/payments/payway/connection", Config()); // 1, 3 y 6
        var (_, variantId) = await merchant.CreateProductAsync("Reloj Payway", priceMinor: 50_000_00);

        // Fuera de lo configurado: 400 y a Payway no le llega nada.
        foreach (var (installments, token) in new[] { (12, "tok-12-cuotas"), (99, "tok-99-cuotas"), (0, "tok-0-cuotas") })
        {
            var checkoutId = await shopper.CheckoutAsync(variantId);
            var res = await shopper.SendAsync(HttpMethod.Post, $"/api/v1/checkout/{checkoutId}/pay-payway", Card(token, installments: installments));
            Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
            Assert.Contains("Elegí una de las opciones de cuotas", await res.Content.ReadAsStringAsync());
            Assert.DoesNotContain(_factory.ExternalHttp.SentTo($"{Sandbox}/payments"), r => r.Body?.Contains(token) == true);
        }

        // Una de las configuradas, sí.
        var okCheckout = await shopper.CheckoutAsync(variantId);
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Sandbox}/payments", Approved(9_400_001, 50_000_00), HttpStatusCode.Created);
        var paid = await shopper.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/checkout/{okCheckout}/pay-payway", Card("tok-6-cuotas", installments: 6));
        Assert.Equal("APPROVED", paid.GetProperty("status").GetString());
        var charge = _factory.ExternalHttp.SentTo($"{Sandbox}/payments").Last(r => r.Body?.Contains("tok-6-cuotas") == true);
        Assert.Contains("\"installments\":6", charge.Body);
    }

    [Fact]
    public async Task Reembolsar_una_venta_de_Payway_devuelve_por_Payway_y_no_por_Mercado_Pago()
    {
        var merchant = await Merchant.CreateAsync(_factory, "pwd");
        var shopper = new Shopper(merchant);
        await merchant.PutAsync("/api/v1/payments/payway/connection", Config());
        // Con Mercado Pago conectado también: antes, todo reembolso iba ahí.
        await merchant.ConnectMercadoPagoAsync(Random.Shared.NextInt64(1_000_000, 9_000_000_000));
        var (_, variantId) = await merchant.CreateProductAsync("Bolso Payway", priceMinor: 40_000_00);

        var paymentId = Random.Shared.NextInt64(10_000_000, 99_999_999);
        var checkoutId = await shopper.CheckoutAsync(variantId);
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Sandbox}/payments", Approved(paymentId, 40_000_00), HttpStatusCode.Created);
        var paid = await shopper.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/checkout/{checkoutId}/pay-payway", Card($"tok-dev-{paymentId}"));
        var orderId = paid.GetProperty("orderId").GetGuid();

        var refundsUrl = $"{Sandbox}/payments/{paymentId}/refunds";
        _factory.ExternalHttp.On(HttpMethod.Post, refundsUrl, (_, body) => FakeHttp.Json(new
        {
            id = Random.Shared.Next(1, 1_000_000),
            amount = body!.Contains("amount") ? 10_000_00L : 40_000_00L,
            status = "approved",
        }));

        // Parcial: el monto en centavos, como lo cuenta Payway.
        await merchant.PostAsync($"/api/v1/orders/{orderId}/refund", new { amount = 10_000m, reason = "Cambio" });
        Assert.Equal("PARTIALLYREFUNDED", await StatusAsync(shopper, orderId));

        // El resto: con un parcial previo va con monto explícito.
        await merchant.PostAsync($"/api/v1/orders/{orderId}/refund", new { reason = "Devolución total" });
        Assert.Equal("REFUNDED", await StatusAsync(shopper, orderId));

        var refunds = _factory.ExternalHttp.SentTo(refundsUrl);
        Assert.Equal(2, refunds.Count);
        Assert.Equal("priv-key", refunds[0].Headers["apikey"]);
        Assert.Contains("\"amount\":1000000", refunds[0].Body);
        Assert.Contains("\"amount\":3000000", refunds[1].Body);
        Assert.Empty(_factory.ExternalHttp.SentTo($"https://api.mercadopago.com/v1/payments/{paymentId}"));

        var history = await merchant.GetAsync($"/api/v1/orders/{orderId}/refunds");
        Assert.Equal(2, history.GetProperty("items").GetArrayLength());
        // El panel nombra por dónde vuelve la plata: Payway, no Mercado Pago.
        Assert.Equal("payway", history.GetProperty("gateway").GetString());

        // Ya no queda nada: no se le vuelve a pedir a Payway.
        Assert.Equal(HttpStatusCode.Conflict,
            (await merchant.SendAsync(HttpMethod.Post, $"/api/v1/orders/{orderId}/refund", new { })).StatusCode);
        Assert.Equal(2, _factory.ExternalHttp.SentTo(refundsUrl).Count);

        // Si Payway rechaza la devolución, la venta queda como estaba.
        var otherPayment = paymentId + 1;
        var otherCheckout = await shopper.CheckoutAsync(variantId);
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Sandbox}/payments", Approved(otherPayment, 40_000_00), HttpStatusCode.Created);
        var other = (await shopper.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/checkout/{otherCheckout}/pay-payway", Card($"tok-dev-{otherPayment}")))
            .GetProperty("orderId").GetGuid();
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Sandbox}/payments/{otherPayment}/refunds", new { error = "x" }, HttpStatusCode.BadRequest);
        Assert.False((await merchant.SendAsync(HttpMethod.Post, $"/api/v1/orders/{other}/refund", new { })).IsSuccessStatusCode);
        Assert.Equal("PAID", await StatusAsync(shopper, other));
    }

    [Fact]
    public async Task Lo_que_quedo_en_el_medio_se_reconsulta_hasta_resolverse()
    {
        var merchant = await Merchant.CreateAsync(_factory, "pwq");
        var shopper = new Shopper(merchant);
        await merchant.PutAsync("/api/v1/payments/payway/connection", Config());
        var (_, variantId) = await merchant.CreateProductAsync("Mochila Payway", priceMinor: 30_000_00);

        // Payway "conoce" solo las operaciones que el test le cargue. Las de
        // otros tests que también quedaron en el medio reciben "no existe".
        var known = new ConcurrentDictionary<string, object>();
        _factory.ExternalHttp.On(HttpMethod.Get, $"{Sandbox}/payments?siteOperationId=", (req, _) =>
        {
            var tx = HttpUtility.ParseQueryString(req.RequestUri!.Query)["siteOperationId"];
            return FakeHttp.Json(new { results = tx is not null && known.TryGetValue(tx, out var p) ? new[] { p } : [] });
        });

        // 1. El cobro no contesta y Payway tampoco lo encuentra: queda "no sabemos".
        var buyer = $"pwq-{Guid.NewGuid():N}@test.local";
        var lostCheckout = await shopper.CheckoutAsync(variantId, email: buyer);
        _factory.ExternalHttp.On(HttpMethod.Post, $"{Sandbox}/payments", (_, _) => throw new HttpRequestException("timeout simulado"));
        var lost = await shopper.SendAsync(HttpMethod.Post, $"/api/v1/checkout/{lostCheckout}/pay-payway", Card("tok-q-lost"));
        Assert.Contains("No vuelvas a intentar", await lost.Content.ReadAsStringAsync());

        // 2. Otro queda en revisión del antifraude.
        var reviewCheckout = await shopper.CheckoutAsync(variantId);
        var reviewPayment = Random.Shared.NextInt64(10_000_000, 99_999_999);
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Sandbox}/payments",
            new { id = reviewPayment, status = "review", amount = 30_000_00 }, HttpStatusCode.Created);
        var review = await shopper.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/checkout/{reviewCheckout}/pay-payway", Card("tok-q-review"));
        Assert.Equal("UNDERREVIEW", review.GetProperty("status").GetString());
        var reviewOrder = review.GetProperty("orderId").GetGuid();
        Assert.Equal("PENDINGPAYMENT", await StatusAsync(shopper, reviewOrder));

        var attempts = await AttemptsAsync(merchant.TenantId);
        var lostAttempt = Assert.Single(attempts, a => a.Status == PaywayPaymentStatus.Unknown);
        var reviewAttempt = Assert.Single(attempts, a => a.Status == PaywayPaymentStatus.UnderReview);
        string LookupUrl(PaywayPaymentAttempt a) => $"{Sandbox}/payments?siteOperationId={a.SiteTransactionId}";

        // 3. Recién pasó: todavía no toca volver a preguntar.
        var asked = _factory.ExternalHttp.SentTo(LookupUrl(lostAttempt)).Count;
        using (var scope = _factory.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<PaywayReconciliationService>().RecheckDueAsync(DateTime.UtcNow, default);
        Assert.Equal(asked, _factory.ExternalHttp.SentTo(LookupUrl(lostAttempt)).Count);
        Assert.Empty(_factory.ExternalHttp.SentTo(LookupUrl(reviewAttempt)));

        // 4. Payway lo resolvió: el que no contestó se había cobrado; el de
        //    revisión, se rechazó. Pasaron diez minutos.
        var lostPayment = Random.Shared.NextInt64(10_000_000, 99_999_999);
        known[lostAttempt.SiteTransactionId] = Approved(lostPayment, 30_000_00);
        known[reviewAttempt.SiteTransactionId] = new
        {
            id = reviewPayment,
            status = "rejected",
            amount = 30_000_00,
            status_details = new { error = new { type = "fraud", reason = new { id = 10003, description = "RECHAZADA POR ANTIFRAUDE" } } },
        };
        await BackdateAsync(merchant.TenantId, TimeSpan.FromMinutes(10));

        for (var pass = 0; pass < 10; pass++)
        {
            await Workers.RunOnceAsync<PaywayReconciliationWorker>(_factory);
            if ((await AttemptsAsync(merchant.TenantId)).All(a => !a.NeedsRecheck)) break;
        }

        // El cobrado queda pagado por el mismo camino que un cobro en el momento
        // (con el email de confirmación); el rechazado libera el stock.
        Assert.Equal("PAID", await StatusAsync(shopper, lostAttempt.OrderId));
        Assert.Equal("FAILED", await StatusAsync(shopper, reviewOrder));
        Assert.NotEmpty(_factory.ExternalHttp.EmailsTo(buyer));

        attempts = await AttemptsAsync(merchant.TenantId);
        var settled = Assert.Single(attempts, a => a.Id == lostAttempt.Id);
        Assert.Equal(PaywayPaymentStatus.Approved, settled.Status);
        Assert.Equal(lostPayment.ToString(), settled.ProviderPaymentId);
        Assert.Equal(PaywayPaymentStatus.Declined, Assert.Single(attempts, a => a.Id == reviewAttempt.Id).Status);

        // Resuelto, no se vuelve a preguntar; y el cobro nunca se reintentó.
        asked = _factory.ExternalHttp.SentTo(LookupUrl(lostAttempt)).Count;
        await BackdateAsync(merchant.TenantId, TimeSpan.FromHours(1));
        await Workers.RunOnceAsync<PaywayReconciliationWorker>(_factory);
        Assert.Equal(asked, _factory.ExternalHttp.SentTo(LookupUrl(lostAttempt)).Count);
        Assert.Single(_factory.ExternalHttp.SentTo($"{Sandbox}/payments"),
            r => r.Method == HttpMethod.Post && r.Body?.Contains("tok-q-lost") == true);
    }

    // ---------------------------------------------------------------- helpers

    private async Task<List<PaywayPaymentAttempt>> AttemptsAsync(Guid tenantId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<PaymentsDbContext>();
        return await db.PaywayPaymentAttempts.IgnoreQueryFilters().AsNoTracking().Where(a => a.TenantId == tenantId).ToListAsync();
    }

    /// <summary>Hace como si los intentos de la tienda hubieran pasado hace <paramref name="ago"/>.</summary>
    private async Task BackdateAsync(Guid tenantId, TimeSpan ago)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<PaymentsDbContext>();
        await db.PaywayPaymentAttempts.IgnoreQueryFilters().Where(a => a.TenantId == tenantId).ExecuteUpdateAsync(s => s
            .SetProperty(a => a.CreatedAtUtc, a => a.CreatedAtUtc - ago)
            .SetProperty(a => a.ProcessedAtUtc, a => a.ProcessedAtUtc - ago));
    }

    private static async Task<string?> StatusAsync(Shopper shopper, Guid orderId) =>
        (await shopper.ExpectJsonAsync(HttpMethod.Get, $"/api/v1/orders/{orderId}/status")).GetProperty("status").GetString();
}
