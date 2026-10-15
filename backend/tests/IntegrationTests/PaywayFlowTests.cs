using System.Net;
using Microsoft.Extensions.DependencyInjection;
using Payments.Contracts;
using Payments.Core.Domain;
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
        using (var scope = _factory.Services.CreateScope())
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
}
