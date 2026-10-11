using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Web;
using Api.Payments;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Payments.Infrastructure.Persistence;
using SharedKernel.Common;

namespace IntegrationTests;

/// <summary>
/// El cobro con Mercado Pago de punta a punta, con MP simulado en
/// <see cref="FakeHttp"/>: conectar la cuenta por OAuth → el comprador paga con
/// Checkout Pro → MP avisa por webhook firmado → el worker concilia la orden →
/// el comercio reembolsa.
///
/// <para>
/// Es el camino del dinero: cada paso que se rompe es una venta cobrada que no
/// aparece, o una que aparece sin cobrar. El webhook se firma igual que lo
/// firma MP (HMAC del id, el request-id y el timestamp), así que también se
/// prueba que una firma mala no entra.
/// </para>
/// </summary>
[Collection("api")]
public sealed class MercadoPagoFlowTests
{
    private const string Api = "https://api.mercadopago.com";
    private readonly ApiFactory _factory;

    public MercadoPagoFlowTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Conectar_cobrar_conciliar_y_reembolsar()
    {
        var merchant = await Merchant.CreateAsync(_factory, "mp");
        var mpUserId = Random.Shared.NextInt64(1_000_000, 9_000_000_000);

        // 1. Conectar: el OAuth de verdad, con el canje del code simulado.
        Assert.False((await merchant.GetAsync("/api/v1/payments/mercadopago/connection")).GetProperty("connected").GetBoolean());
        await ConnectAsync(merchant, mpUserId);

        var connection = await merchant.GetAsync("/api/v1/payments/mercadopago/connection");
        Assert.True(connection.GetProperty("connected").GetBoolean());
        Assert.Equal(mpUserId, connection.GetProperty("userId").GetInt64());
        // Los tokens quedan cifrados: nunca vuelven al panel ni al storefront.
        Assert.DoesNotContain("APP_USR-access", connection.ToString());
        var publicConfig = await new Shopper(merchant).ExpectJsonAsync(HttpMethod.Get, "/api/v1/payments/mercadopago/public-config");
        Assert.Equal("APP_USR-public", publicConfig.GetProperty("publicKey").GetString());

        var prefs = await merchant.PutAsync("/api/v1/payments/mercadopago/preferences",
            new { checkoutMode = "api", marketplaceFeePercent = 2.5m, statementDescriptor = "TIENDA TEST" });
        Assert.Equal("API", prefs.GetProperty("checkoutMode").GetString());

        // 2. El comprador paga con Checkout Pro.
        var (_, variantId) = await merchant.CreateProductAsync("Remera MP", priceMinor: 20_000_00);
        var shopper = new Shopper(merchant);
        var checkoutId = await shopper.CheckoutAsync(variantId, quantity: 2);

        var badUrl = await shopper.SendAsync(HttpMethod.Post, $"/api/v1/checkout/{checkoutId}/pay",
            new { returnUrl = "https://phishing.example.com" });
        Assert.Equal(HttpStatusCode.BadRequest, badUrl.StatusCode);

        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Api}/v1/checkout/preferences",
            new { id = "pref-123", init_point = "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-123" });
        var pay = await shopper.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/checkout/{checkoutId}/pay", new { returnUrl = shopper.ReturnUrl });
        var orderId = pay.GetProperty("orderId").GetGuid();
        Assert.Contains("pref-123", pay.GetProperty("initPoint").GetString());

        var preference = _factory.ExternalHttp.SentTo($"{Api}/v1/checkout/preferences").Last();
        Assert.Equal(orderId.ToString(), preference.Headers["X-Idempotency-Key"]);
        Assert.Contains("\"marketplace_fee\":1000", preference.Body); // 2,5 % de 40.000
        Assert.Contains("TIENDA TEST", preference.Body);
        Assert.Equal("PENDINGPAYMENT", await StatusAsync(shopper, orderId));

        // 3. MP avisa. Firma mala: afuera. Firma buena: se encola (y un
        //    reenvío del mismo aviso no duplica).
        var paymentId = Random.Shared.NextInt64(10_000_000, 99_999_999).ToString();
        Assert.Equal(HttpStatusCode.Unauthorized, (await WebhookAsync(paymentId, mpUserId, secret: "otro")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await WebhookAsync(paymentId, mpUserId)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await WebhookAsync(paymentId, mpUserId)).StatusCode);

        var health = await merchant.GetAsync("/api/v1/payments/mercadopago/webhooks/health");
        Assert.Equal(1, health.GetProperty("pending").GetInt32());

        // 4. El worker consulta el pago en MP y concilia la orden.
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/v1/payments/{paymentId}", new
        {
            id = long.Parse(paymentId),
            status = "approved",
            status_detail = "accredited",
            external_reference = orderId.ToString(),
            transaction_amount = 40_000m,
            transaction_amount_refunded = 0m,
            transaction_details = new { net_received_amount = 37_500m },
        });
        await DrainWebhooksAsync();
        Assert.Equal("PAID", await StatusAsync(shopper, orderId));
        Assert.Equal(0, (await merchant.GetAsync("/api/v1/payments/mercadopago/webhooks/health")).GetProperty("pending").GetInt32());

        // 5. Reembolso parcial y después el resto.
        _factory.ExternalHttp.On(HttpMethod.Post, $"{Api}/v1/payments/{paymentId}/refunds", (_, body) =>
            FakeHttp.Json(new { id = Random.Shared.Next(), amount = body!.Contains("amount") ? 10_000m : 30_000m }));

        var tooMuch = await merchant.SendAsync(HttpMethod.Post, $"/api/v1/orders/{orderId}/refund", new { amount = 999_999m });
        Assert.Equal(HttpStatusCode.BadRequest, tooMuch.StatusCode);

        await merchant.PostAsync($"/api/v1/orders/{orderId}/refund", new { amount = 10_000m, reason = "Cambio de talle" });
        Assert.Equal("PARTIALLYREFUNDED", await StatusAsync(shopper, orderId));

        await merchant.PostAsync($"/api/v1/orders/{orderId}/refund", new { reason = "Devolución total", restock = true });
        Assert.Equal("REFUNDED", await StatusAsync(shopper, orderId));
        var refunds = _factory.ExternalHttp.SentTo($"{Api}/v1/payments/{paymentId}/refunds");
        Assert.Equal(2, refunds.Count);
        // Cada reembolso con su clave: MP no los puede confundir con un reintento.
        Assert.NotEqual(refunds[0].Headers["X-Idempotency-Key"], refunds[1].Headers["X-Idempotency-Key"]);

        var history = await merchant.GetAsync($"/api/v1/orders/{orderId}/refunds");
        Assert.Equal(2, history.GetProperty("items").GetArrayLength());

        // Ya no queda nada por devolver.
        Assert.Equal(HttpStatusCode.Conflict,
            (await merchant.SendAsync(HttpMethod.Post, $"/api/v1/orders/{orderId}/refund", new { })).StatusCode);
    }

    [Fact]
    public async Task Pago_con_tarjeta_en_la_tienda()
    {
        var merchant = await Merchant.CreateAsync(_factory, "mpo");
        await ConnectAsync(merchant, Random.Shared.NextInt64(1_000_000, 9_000_000_000));
        var (_, variantId) = await merchant.CreateProductAsync("Buzo MP", priceMinor: 30_000_00);
        var shopper = new Shopper(merchant);

        // Sin token de tarjeta no se intenta cobrar.
        var checkoutId = await shopper.CheckoutAsync(variantId);
        Assert.Equal(HttpStatusCode.BadRequest, (await shopper.SendAsync(HttpMethod.Post,
            $"/api/v1/checkout/{checkoutId}/pay-onsite", new { token = "", paymentMethodId = "visa" })).StatusCode);

        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Api}/v1/payments",
            new { id = 555_000_111L, status = "approved", status_detail = "accredited" });
        var paid = await shopper.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/checkout/{checkoutId}/pay-onsite", new
        {
            token = "card-token",
            paymentMethodId = "visa",
            installments = 3,
            issuerId = "310",
            payerDocType = "DNI",
            payerDocNumber = "30111222",
        });
        Assert.Equal("approved", paid.GetProperty("status").GetString());
        Assert.Equal("PAID", await StatusAsync(shopper, paid.GetProperty("orderId").GetGuid()));
        var sent = _factory.ExternalHttp.SentTo($"{Api}/v1/payments").Last(r => r.Method == HttpMethod.Post);
        Assert.Contains("\"installments\":3", sent.Body);
        Assert.Contains("\"issuer_id\":\"310\"", sent.Body);

        // Tarjeta rechazada por MP: el comprador ve el error y la orden no se paga.
        var otherCheckout = await shopper.CheckoutAsync(variantId);
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Api}/v1/payments", new { message = "invalid card" }, HttpStatusCode.BadRequest);
        var rejected = await shopper.SendAsync(HttpMethod.Post, $"/api/v1/checkout/{otherCheckout}/pay-onsite",
            new { token = "card-token", paymentMethodId = "visa" });
        Assert.False(rejected.IsSuccessStatusCode);
    }

    [Fact]
    public async Task Los_avisos_que_no_se_pueden_procesar_quedan_a_la_vista_y_se_reintentan()
    {
        var merchant = await Merchant.CreateAsync(_factory, "mpw");
        var mpUserId = Random.Shared.NextInt64(1_000_000, 9_000_000_000);

        // Sin conexión: la salud no muestra nada y no hay qué reintentar.
        Assert.False((await merchant.GetAsync("/api/v1/payments/mercadopago/webhooks/health")).GetProperty("connected").GetBoolean());
        Assert.Equal(HttpStatusCode.Conflict,
            (await merchant.SendAsync(HttpMethod.Post, $"/api/v1/payments/mercadopago/webhooks/{Guid.NewGuid()}/retry")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await merchant.SendAsync(HttpMethod.Put, "/api/v1/payments/mercadopago/preferences", new { })).StatusCode);

        await ConnectAsync(merchant, mpUserId);

        // MP no responde el pago: el worker registra el fallo y lo deja para después.
        var paymentId = Random.Shared.NextInt64(10_000_000, 99_999_999).ToString();
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/v1/payments/{paymentId}", new { message = "boom" }, HttpStatusCode.InternalServerError);
        await WebhookAsync(paymentId, mpUserId);
        await DrainWebhooksAsync();

        Guid eventId;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PaymentsDbContext>();
            var ev = await db.PaymentWebhookEvents.AsNoTracking().SingleAsync(e => e.DataId == paymentId);
            Assert.Equal(1, ev.Attempts);
            Assert.Contains("No se pudo consultar el pago", ev.LastError);
            eventId = ev.Id;

            // Agotó los reintentos: queda muerto, que es lo que el panel tiene que mostrar.
            await db.PaymentWebhookEvents.Where(e => e.Id == eventId)
                .ExecuteUpdateAsync(s => s.SetProperty(e => e.Status, InboxEntry.StatusDead));
        }

        var health = await merchant.GetAsync("/api/v1/payments/mercadopago/webhooks/health");
        Assert.Equal(1, health.GetProperty("stuck").GetInt32());
        Assert.Equal(paymentId, health.GetProperty("stuckEvents")[0].GetProperty("dataId").GetString());

        // Reintentar a mano lo devuelve a la cola; dos veces no.
        await merchant.ExpectOkAsync(HttpMethod.Post, $"/api/v1/payments/mercadopago/webhooks/{eventId}/retry");
        Assert.Equal(HttpStatusCode.Conflict,
            (await merchant.SendAsync(HttpMethod.Post, $"/api/v1/payments/mercadopago/webhooks/{eventId}/retry")).StatusCode);
        // El de otra tienda (o inexistente) no se toca.
        Assert.Equal(HttpStatusCode.NotFound,
            (await merchant.SendAsync(HttpMethod.Post, $"/api/v1/payments/mercadopago/webhooks/{Guid.NewGuid()}/retry")).StatusCode);

        // Un pago sin referencia a una orden, y un aviso de una cuenta que no es
        // de ninguna tienda: se descartan sin reintentar.
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/v1/payments/{paymentId}",
            new { id = long.Parse(paymentId), status = "approved", external_reference = "no-es-una-orden" });
        await WebhookAsync("1" + paymentId, userId: 1);
        await DrainWebhooksAsync();
        Assert.Equal(0, (await merchant.GetAsync("/api/v1/payments/mercadopago/webhooks/health")).GetProperty("pending").GetInt32());

        // Desconectar.
        await merchant.ExpectOkAsync(HttpMethod.Delete, "/api/v1/payments/mercadopago/connection");
        await merchant.ExpectOkAsync(HttpMethod.Delete, "/api/v1/payments/mercadopago/connection");
        Assert.False((await merchant.GetAsync("/api/v1/payments/mercadopago/connection")).GetProperty("connected").GetBoolean());
    }

    [Fact]
    public async Task Un_OAuth_trucho_o_fallido_vuelve_al_panel_con_error()
    {
        var anonymous = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

        var sinCode = await anonymous.GetAsync("/api/v1/payments/mercadopago/callback");
        Assert.EndsWith("mp=error", sinCode.Headers.Location!.ToString());

        var stateFalso = await anonymous.GetAsync("/api/v1/payments/mercadopago/callback?code=abc&state=inventado");
        Assert.EndsWith("mp=error", stateFalso.Headers.Location!.ToString());

        // State válido pero MP rechaza el code.
        var merchant = await Merchant.CreateAsync(_factory, "mpx");
        var connect = await merchant.PostAsync("/api/v1/payments/mercadopago/connect", new { });
        var state = HttpUtility.ParseQueryString(new Uri(connect.GetProperty("authUrl").GetString()!).Query)["state"];
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Api}/oauth/token", new { error = "invalid_grant" }, HttpStatusCode.BadRequest);
        var rechazado = await anonymous.GetAsync($"/api/v1/payments/mercadopago/callback?code=vencido&state={Uri.EscapeDataString(state!)}");
        Assert.EndsWith("mp=error", rechazado.Headers.Location!.ToString());
    }

    // ---------------------------------------------------------------- helpers

    /// <summary>El OAuth completo: pedir la URL, "autorizar" y volver por el callback.</summary>
    private async Task ConnectAsync(Merchant merchant, long mpUserId)
    {
        var connect = await merchant.PostAsync("/api/v1/payments/mercadopago/connect", new { });
        var authUrl = new Uri(connect.GetProperty("authUrl").GetString()!);
        Assert.StartsWith("https://auth.mercadopago.com.ar/authorization", authUrl.ToString());
        var state = HttpUtility.ParseQueryString(authUrl.Query)["state"]!;

        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Api}/oauth/token", new
        {
            user_id = mpUserId,
            access_token = "APP_USR-access",
            refresh_token = "TG-refresh",
            public_key = "APP_USR-public",
            scope = "offline_access read write",
            expires_in = 15_552_000,
        });

        var browser = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var callback = await browser.GetAsync($"/api/v1/payments/mercadopago/callback?code=TG-code&state={Uri.EscapeDataString(state)}");
        Assert.Equal(HttpStatusCode.Redirect, callback.StatusCode);
        Assert.EndsWith("mp=connected", callback.Headers.Location!.ToString());
        Assert.Contains("code=TG-code", _factory.ExternalHttp.SentTo($"{Api}/oauth/token").Last().Body);
    }

    /// <summary>
    /// Pasadas del worker hasta vaciar lo que está para procesar. La base de
    /// tests persiste entre corridas y el worker toma de a 20: puede haber
    /// avisos viejos adelante del de este test.
    /// </summary>
    private async Task DrainWebhooksAsync()
    {
        for (var pass = 0; pass < 20; pass++)
        {
            await Workers.RunOnceAsync<PaymentWebhookWorker>(_factory);
            using var scope = _factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<PaymentsDbContext>();
            var now = DateTime.UtcNow;
            if (!await db.PaymentWebhookEvents.AnyAsync(e => e.Status == InboxEntry.StatusPending && e.NextAttemptAtUtc <= now))
                return;
        }
    }

    /// <summary>Un aviso de MP, firmado como lo firma MP.</summary>
    private Task<HttpResponseMessage> WebhookAsync(string paymentId, long userId, string secret = ApiFactory.MercadoPagoWebhookSecret)
    {
        var requestId = Guid.NewGuid().ToString();
        var ts = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();
        var v1 = Convert.ToHexString(HMACSHA256.HashData(
            Encoding.UTF8.GetBytes(secret),
            Encoding.UTF8.GetBytes($"id:{paymentId};request-id:{requestId};ts:{ts};"))).ToLowerInvariant();

        var req = new HttpRequestMessage(HttpMethod.Post, "/api/v1/payments/webhooks/mercadopago")
        {
            Content = new StringContent(
                $$$"""{"type":"payment","action":"payment.updated","user_id":{{{userId}}},"data":{"id":"{{{paymentId}}}"}}""",
                Encoding.UTF8, "application/json"),
        };
        req.Headers.Add("x-signature", $"ts={ts},v1={v1}");
        req.Headers.Add("x-request-id", requestId);
        return _factory.CreateClient().SendAsync(req);
    }

    private static async Task<string?> StatusAsync(Shopper shopper, Guid orderId) =>
        (await shopper.ExpectJsonAsync(HttpMethod.Get, $"/api/v1/orders/{orderId}/status")).GetProperty("status").GetString();
}
