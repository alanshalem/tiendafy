using System.Net;
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
        await merchant.ConnectMercadoPagoAsync(mpUserId);

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

        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Api}/checkout/preferences",
            new { id = "pref-123", init_point = "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-123" });
        var pay = await shopper.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/checkout/{checkoutId}/pay", new { returnUrl = shopper.ReturnUrl });
        var orderId = pay.GetProperty("orderId").GetGuid();
        Assert.Contains("pref-123", pay.GetProperty("initPoint").GetString());

        var preference = _factory.ExternalHttp.SentTo($"{Api}/checkout/preferences").Last();
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
        // El ts en milisegundos (como un ejemplo de la documentación de MP) también
        // vale; uno ilegible es firma inválida, no un 500 (antes, FromUnixTimeSeconds
        // tiraba fuera de rango).
        Assert.Equal(HttpStatusCode.OK, (await WebhookAsync(paymentId, mpUserId,
            ts: DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString())).StatusCode);
        foreach (var bad in new[] { "99999999999999999", "abc", "-1", "1.7e9", "999999999999999999999" })
            Assert.Equal(HttpStatusCode.Unauthorized, (await WebhookAsync(paymentId, mpUserId, ts: bad)).StatusCode);

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
        Assert.Equal("mercadopago", history.GetProperty("gateway").GetString());

        // Ya no queda nada por devolver.
        Assert.Equal(HttpStatusCode.Conflict,
            (await merchant.SendAsync(HttpMethod.Post, $"/api/v1/orders/{orderId}/refund", new { })).StatusCode);
    }

    [Fact]
    public async Task Pago_con_tarjeta_en_la_tienda()
    {
        var merchant = await Merchant.CreateAsync(_factory, "mpo");
        var mpUserId = Random.Shared.NextInt64(1_000_000, 9_000_000_000);
        await merchant.ConnectMercadoPagoAsync(mpUserId);
        var (_, variantId) = await merchant.CreateProductAsync("Buzo MP", priceMinor: 30_000_00);
        var shopper = new Shopper(merchant);

        // Sin token de tarjeta no se intenta cobrar.
        var checkoutId = await shopper.CheckoutAsync(variantId);
        Assert.Equal(HttpStatusCode.BadRequest, (await shopper.SendAsync(HttpMethod.Post,
            $"/api/v1/checkout/{checkoutId}/pay-onsite", new { token = "", paymentMethodId = "visa" })).StatusCode);

        // Id de pago nuevo en cada corrida: la base de tests persiste y el inbox
        // guarda una fila por pago.
        var cardPayment = Random.Shared.NextInt64(100_000_000, 999_999_999);
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Api}/v1/payments",
            new { id = cardPayment, status = "approved", status_detail = "accredited" });
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

        // La respuesta del cobro no trae el neto: la comisión llega con el
        // webhook del mismo pago, cuando la orden ya está pagada. Se guarda
        // igual (Rentabilidad la necesita) sin volver a dar la venta por pagada.
        var paidOrderId = paid.GetProperty("orderId").GetGuid();
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/v1/payments/{cardPayment}", new
        {
            id = cardPayment,
            status = "approved",
            status_detail = "accredited",
            external_reference = paidOrderId.ToString(),
            transaction_amount = 30_000m,
            transaction_amount_refunded = 0m,
            transaction_details = new { net_received_amount = 28_200m },
        });
        await WebhookAsync(cardPayment.ToString(), mpUserId);
        await DrainWebhooksAsync();
        Assert.Equal("PAID", await StatusAsync(shopper, paidOrderId));
        using (var scope = _factory.Services.CreateScope())
        {
            var orders = scope.ServiceProvider.GetRequiredService<Orders.Infrastructure.Persistence.OrdersDbContext>();
            var fee = await orders.Orders.AsNoTracking().Where(o => o.Id == paidOrderId).Select(o => o.MpFeeAmount).SingleAsync();
            Assert.Equal(1_800_00, fee?.AmountInMinorUnits);
        }

        // Tarjeta rechazada por MP: el comprador ve el error y la orden no se paga.
        var otherCheckout = await shopper.CheckoutAsync(variantId);
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Api}/v1/payments", new { message = "invalid card" }, HttpStatusCode.BadRequest);
        var rejected = await shopper.SendAsync(HttpMethod.Post, $"/api/v1/checkout/{otherCheckout}/pay-onsite",
            new { token = "card-token", paymentMethodId = "visa" });
        Assert.False(rejected.IsSuccessStatusCode);
    }

    /// <summary>
    /// MP avisa cada cambio del mismo pago con el mismo id. Una tarjeta que
    /// queda en revisión (o un pago en efectivo) se aprueba con un aviso
    /// posterior: antes el inbox lo descartaba por repetido y la venta quedaba
    /// pendiente para siempre.
    /// </summary>
    [Fact]
    public async Task Un_pago_que_queda_pendiente_se_cobra_con_el_aviso_siguiente()
    {
        var merchant = await Merchant.CreateAsync(_factory, "mpp");
        var mpUserId = Random.Shared.NextInt64(1_000_000, 9_000_000_000);
        await merchant.ConnectMercadoPagoAsync(mpUserId);
        var (_, variantId) = await merchant.CreateProductAsync("Campera MP", priceMinor: 40_000_00);
        var shopper = new Shopper(merchant);

        var checkoutId = await shopper.CheckoutAsync(variantId);
        var paymentId = Random.Shared.NextInt64(100_000_000, 999_999_999);
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Api}/v1/payments",
            new { id = paymentId, status = "in_process", status_detail = "pending_review_manual" });
        var pay = await shopper.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/checkout/{checkoutId}/pay-onsite",
            new { token = "card-token", paymentMethodId = "visa" });
        var orderId = pay.GetProperty("orderId").GetGuid();

        object Payment(string status) => new
        {
            id = paymentId,
            status,
            status_detail = status == "approved" ? "accredited" : "pending_review_manual",
            external_reference = orderId.ToString(),
            transaction_amount = 40_000m,
            transaction_amount_refunded = 0m,
        };

        // Primer aviso: sigue en revisión.
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/v1/payments/{paymentId}", Payment("in_process"));
        await WebhookAsync(paymentId.ToString(), mpUserId);
        await DrainWebhooksAsync();
        Assert.NotEqual("PAID", await StatusAsync(shopper, orderId));

        // Segundo aviso del mismo pago: MP lo aprobó.
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/v1/payments/{paymentId}", Payment("approved"));
        Assert.Equal(HttpStatusCode.OK, (await WebhookAsync(paymentId.ToString(), mpUserId)).StatusCode);
        await DrainWebhooksAsync();
        Assert.Equal("PAID", await StatusAsync(shopper, orderId));

        // Sigue habiendo una sola fila por pago.
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<PaymentsDbContext>();
        var ev = await db.PaymentWebhookEvents.AsNoTracking().SingleAsync(e => e.DataId == paymentId.ToString());
        Assert.Equal(InboxEntry.StatusDone, ev.Status);
    }

    /// <summary>
    /// El banco pide confirmar el pago (3DS): Mercado Pago contesta
    /// <c>pending</c> / <c>pending_challenge</c> con <c>three_ds_info</c>. La venta
    /// queda pendiente, la tienda recibe lo justo para mostrar el desafío y el
    /// resultado final llega por webhook: aprobado paga, desafío fallido rechaza.
    /// </summary>
    [Fact]
    public async Task Pago_con_tarjeta_que_pide_confirmar_con_el_banco()
    {
        var merchant = await Merchant.CreateAsync(_factory, "mp3ds");
        var mpUserId = Random.Shared.NextInt64(1_000_000, 9_000_000_000);
        await merchant.ConnectMercadoPagoAsync(mpUserId);
        var (_, variantId) = await merchant.CreateProductAsync("Campera 3DS", priceMinor: 50_000_00);
        var shopper = new Shopper(merchant);
        const string acs = "https://acs-public.tp.mastercard.com/api/v1/browser_Challenges";

        async Task<(Guid Order, long Payment)> PayWithChallengeAsync()
        {
            var paymentId = Random.Shared.NextInt64(100_000_000, 999_999_999);
            _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Api}/v1/payments", new
            {
                id = paymentId,
                status = "pending",
                status_detail = "pending_challenge",
                three_ds_info = new { external_resource_url = acs, creq = "eyJjcmVxIjoiZGVtbyJ9" },
            });
            var checkoutId = await shopper.CheckoutAsync(variantId);
            var paid = await shopper.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/checkout/{checkoutId}/pay-onsite",
                new { token = "card-token", paymentMethodId = "master" });

            Assert.Equal("pending", paid.GetProperty("status").GetString());
            Assert.Equal("pending_challenge", paid.GetProperty("statusDetail").GetString());
            var challenge = paid.GetProperty("challenge");
            Assert.Equal(paymentId.ToString(), challenge.GetProperty("paymentId").GetString());
            Assert.Equal(acs, challenge.GetProperty("externalResourceUrl").GetString());
            Assert.Equal("eyJjcmVxIjoiZGVtbyJ9", challenge.GetProperty("creq").GetString());
            // Nada del vendedor ni de la tarjeta en lo que ve el navegador.
            Assert.DoesNotContain("APP_USR", paid.ToString());
            Assert.DoesNotContain("card-token", paid.ToString());

            var orderId = paid.GetProperty("orderId").GetGuid();
            Assert.Equal("PENDINGPAYMENT", await StatusAsync(shopper, orderId));
            return (orderId, paymentId);
        }

        // Desafío superado: el webhook trae el pago aprobado.
        var (approvedOrder, approvedPayment) = await PayWithChallengeAsync();
        var sent = _factory.ExternalHttp.SentTo($"{Api}/v1/payments").Last(r => r.Method == HttpMethod.Post);
        Assert.Contains("\"three_d_secure_mode\":\"optional\"", sent.Body);
        Assert.Contains("\"binary_mode\":false", sent.Body);
        Assert.Contains("\"capture\":true", sent.Body);

        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/v1/payments/{approvedPayment}", new
        {
            id = approvedPayment,
            status = "approved",
            status_detail = "accredited",
            external_reference = approvedOrder.ToString(),
            transaction_amount = 50_000m,
            transaction_amount_refunded = 0m,
        });
        await WebhookAsync(approvedPayment.ToString(), mpUserId);
        await DrainWebhooksAsync();
        Assert.Equal("PAID", await StatusAsync(shopper, approvedOrder));

        // Desafío fallido: Mercado Pago lo rechaza y la venta no se cobra.
        var (rejectedOrder, rejectedPayment) = await PayWithChallengeAsync();
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/v1/payments/{rejectedPayment}", new
        {
            id = rejectedPayment,
            status = "rejected",
            status_detail = "cc_rejected_3ds_challenge",
            external_reference = rejectedOrder.ToString(),
            transaction_amount = 50_000m,
            transaction_amount_refunded = 0m,
        });
        await WebhookAsync(rejectedPayment.ToString(), mpUserId);
        await DrainWebhooksAsync();
        Assert.Equal("FAILED", await StatusAsync(shopper, rejectedOrder));

        // Sin desafío no viaja nada para mostrar.
        var plainPayment = Random.Shared.NextInt64(100_000_000, 999_999_999);
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Api}/v1/payments",
            new { id = plainPayment, status = "approved", status_detail = "accredited" });
        var plainCheckout = await shopper.CheckoutAsync(variantId);
        var plain = await shopper.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/checkout/{plainCheckout}/pay-onsite",
            new { token = "card-token", paymentMethodId = "visa" });
        Assert.Equal(System.Text.Json.JsonValueKind.Null, plain.GetProperty("challenge").ValueKind);
    }

    /// <summary>
    /// Un reembolso total le avisa al comprador con la plantilla "Cancelación de
    /// compra" de la tienda, lo haga el comercio desde el panel o desde su cuenta
    /// de Mercado Pago (llega por webhook). Antes el webhook mandaba un texto fijo
    /// propio, que el comercio no podía editar ni apagar.
    /// </summary>
    [Fact]
    public async Task Un_reembolso_avisa_con_la_plantilla_de_la_tienda_venga_del_panel_o_de_Mercado_Pago()
    {
        var merchant = await Merchant.CreateAsync(_factory, "mpr");
        var mpUserId = Random.Shared.NextInt64(1_000_000, 9_000_000_000);
        await merchant.ConnectMercadoPagoAsync(mpUserId);
        await merchant.PutAsync("/api/v1/email-templates/cancelacion-compra", new
        {
            enabled = true,
            subject = "Reembolsamos tu pedido #{{order_id}}",
            bodyHtml = "<p>Listo, {{name}}: te devolvimos la plata.</p>",
        });
        var (_, variantId) = await merchant.CreateProductAsync("Gorra MP", priceMinor: 15_000_00);
        var shopper = new Shopper(merchant);

        // Una venta que no existe no se reembolsa ni se cancela.
        Assert.Equal(HttpStatusCode.NotFound,
            (await merchant.SendAsync(HttpMethod.Post, $"/api/v1/orders/{Guid.NewGuid()}/refund", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await merchant.SendAsync(HttpMethod.Post, $"/api/v1/orders/{Guid.NewGuid()}/cancel", new { })).StatusCode);

        // Desde el panel.
        var (panelOrder, panelPayment, panelBuyer) = await PaidOnsiteAsync(shopper, variantId);
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Api}/v1/payments/{panelPayment}/refunds",
            new { id = Random.Shared.Next(), amount = 15_000m });
        await merchant.PostAsync($"/api/v1/orders/{panelOrder}/refund", new { reason = "Devolución" });
        Assert.Equal("REFUNDED", await StatusAsync(shopper, panelOrder));

        // Desde Mercado Pago: el comercio devolvió en su cuenta y llega el aviso.
        var (mpOrder, mpPayment, mpBuyer) = await PaidOnsiteAsync(shopper, variantId);
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/v1/payments/{mpPayment}", new
        {
            id = mpPayment,
            status = "refunded",
            status_detail = "refunded",
            external_reference = mpOrder.ToString(),
            transaction_amount = 15_000m,
            transaction_amount_refunded = 15_000m,
        });
        await WebhookAsync(mpPayment.ToString(), mpUserId);
        await DrainWebhooksAsync();
        Assert.Equal("REFUNDED", await StatusAsync(shopper, mpOrder));

        foreach (var (order, buyer) in new[] { (panelOrder, panelBuyer), (mpOrder, mpBuyer) })
        {
            var mails = _factory.ExternalHttp.EmailsTo(buyer);
            var mail = Assert.Single(mails, m => m.Subject.StartsWith("Reembolsamos tu pedido #", StringComparison.Ordinal));
            Assert.Contains("te devolvimos la plata", mail.Html);
            Assert.DoesNotContain(mails, m => m.Subject == "Tu compra fue reembolsada");
        }
    }

    [Fact]
    public async Task Con_la_plantilla_apagada_el_reembolso_igual_avisa_con_el_aviso_generico()
    {
        // La plantilla "cancelacion-compra" viene apagada de fábrica. Antes, el
        // reembolso por webhook avisaba igual y el del panel no avisaba nada; un
        // reembolso de plata no puede pasar sin que el comprador se entere.
        var merchant = await Merchant.CreateAsync(_factory, "mpg");
        var mpUserId = Random.Shared.NextInt64(1_000_000, 9_000_000_000);
        await merchant.ConnectMercadoPagoAsync(mpUserId);
        var (_, variantId) = await merchant.CreateProductAsync("Gorra genérica", priceMinor: 15_000_00);
        var shopper = new Shopper(merchant);

        var (panelOrder, panelPayment, panelBuyer) = await PaidOnsiteAsync(shopper, variantId);
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Api}/v1/payments/{panelPayment}/refunds",
            new { id = Random.Shared.Next(), amount = 15_000m });
        await merchant.PostAsync($"/api/v1/orders/{panelOrder}/refund", new { reason = "Devolución" });

        var (mpOrder, mpPayment, mpBuyer) = await PaidOnsiteAsync(shopper, variantId);
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/v1/payments/{mpPayment}", new
        {
            id = mpPayment,
            status = "refunded",
            status_detail = "refunded",
            external_reference = mpOrder.ToString(),
            transaction_amount = 15_000m,
            transaction_amount_refunded = 15_000m,
        });
        await WebhookAsync(mpPayment.ToString(), mpUserId);
        await DrainWebhooksAsync();

        foreach (var buyer in new[] { panelBuyer, mpBuyer })
        {
            var mail = Assert.Single(_factory.ExternalHttp.EmailsTo(buyer), m => m.Subject == "Tu compra fue reembolsada");
            Assert.Contains("ARS 15.000", mail.Html);
        }
    }

    /// <summary>
    /// Un reembolso parcial le avisa al comprador cuánto le devolvieron y por
    /// dónde, lo haga el comercio desde el panel o desde su cuenta de Mercado
    /// Pago. Antes un parcial no avisaba nada. Y uno solo por reembolso: el
    /// reintento del mismo aviso de Mercado Pago no lo repite.
    /// </summary>
    [Fact]
    public async Task Un_reembolso_parcial_avisa_cuanto_y_por_donde_una_sola_vez()
    {
        var merchant = await Merchant.CreateAsync(_factory, "mpp");
        var mpUserId = Random.Shared.NextInt64(1_000_000, 9_000_000_000);
        await merchant.ConnectMercadoPagoAsync(mpUserId);
        var (_, variantId) = await merchant.CreateProductAsync("Campera MP", priceMinor: 15_000_00);
        var shopper = new Shopper(merchant);

        // Desde el panel, con la plantilla apagada (de fábrica): sale el texto de fábrica.
        var (panelOrder, panelPayment, panelBuyer) = await PaidOnsiteAsync(shopper, variantId);
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Api}/v1/payments/{panelPayment}/refunds",
            new { id = Random.Shared.Next(), amount = 5_000m });
        await merchant.PostAsync($"/api/v1/orders/{panelOrder}/refund", new { amount = 5_000m, reason = "Falta una pieza" });
        Assert.Equal("PARTIALLYREFUNDED", await StatusAsync(shopper, panelOrder));

        var panelMail = Assert.Single(_factory.ExternalHttp.EmailsTo(panelBuyer), m => m.Subject.StartsWith("Te devolvimos", StringComparison.Ordinal));
        Assert.StartsWith("Te devolvimos ARS 5.000 de tu pedido #", panelMail.Subject, StringComparison.Ordinal);
        Assert.Contains("Vuelve por Mercado Pago", panelMail.Html, StringComparison.Ordinal);
        Assert.DoesNotContain("Falta una pieza", panelMail.Html, StringComparison.Ordinal); // el motivo es interno
        // No es el aviso de un reembolso total.
        Assert.DoesNotContain(_factory.ExternalHttp.EmailsTo(panelBuyer), m => m.Subject == "Tu compra fue reembolsada");

        // Desde Mercado Pago, con la plantilla de la tienda prendida.
        await merchant.PutAsync("/api/v1/email-templates/reembolso-parcial", new
        {
            enabled = true,
            subject = "Parte de tu plata vuelve: {{refund_amount}}",
            bodyHtml = "<p>{{name}}, te devolvimos {{refund_amount}}. {{refund_method}}</p>",
        });
        var (mpOrder, mpPayment, mpBuyer) = await PaidOnsiteAsync(shopper, variantId);
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/v1/payments/{mpPayment}", new
        {
            id = mpPayment,
            status = "approved",
            status_detail = "partially_refunded",
            external_reference = mpOrder.ToString(),
            transaction_amount = 15_000m,
            transaction_amount_refunded = 4_000m,
        });
        await WebhookAsync(mpPayment.ToString(), mpUserId);
        await DrainWebhooksAsync();
        Assert.Equal("PARTIALLYREFUNDED", await StatusAsync(shopper, mpOrder));

        var mpMail = Assert.Single(_factory.ExternalHttp.EmailsTo(mpBuyer), m => m.Subject.StartsWith("Parte de tu plata vuelve", StringComparison.Ordinal));
        Assert.Equal("Parte de tu plata vuelve: ARS 4.000", mpMail.Subject);
        Assert.Contains("Vuelve por Mercado Pago", mpMail.Html, StringComparison.Ordinal);

        // El mismo aviso procesado otra vez (un reintento): el monto devuelto no
        // creció, así que no sale otro email.
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PaymentsDbContext>();
            var now = DateTime.UtcNow;
            await db.PaymentWebhookEvents.Where(e => e.DataId == mpPayment.ToString())
                .ExecuteUpdateAsync(s => s
                    .SetProperty(e => e.Status, InboxEntry.StatusPending)
                    .SetProperty(e => e.NextAttemptAtUtc, now));
        }
        await DrainWebhooksAsync();
        Assert.Single(_factory.ExternalHttp.EmailsTo(mpBuyer), m => m.Subject.StartsWith("Parte de tu plata vuelve", StringComparison.Ordinal));
    }

    /// <summary>
    /// El WhatsApp "Confirmación de compra" sale cuando la venta queda pagada,
    /// una sola vez: el aviso de Mercado Pago del mismo pago, que llega después,
    /// no lo repite. Antes estaba en el catálogo y nada lo mandaba. Una venta
    /// de mostrador no lo manda (el comprador está ahí), igual que el de pago.
    /// </summary>
    [Fact]
    public async Task La_confirmacion_de_compra_por_WhatsApp_sale_una_vez_al_quedar_pagada()
    {
        var merchant = await Merchant.CreateAsync(_factory, "mwc");
        var mpUserId = Random.Shared.NextInt64(1_000_000, 9_000_000_000);
        await merchant.ConnectMercadoPagoAsync(mpUserId);
        var phoneNumberId = $"pn{Guid.NewGuid():N}"[..14];
        const string graph = global::Api.MetaAds.MetaGraph.ApiBaseUrl;
        var messages = $"{graph}/{phoneNumberId}/messages";
        await merchant.ExpectOkAsync(HttpMethod.Put, "/api/v1/whatsapp/connection", new { phoneNumberId, accessToken = "EAAG-mwc" });
        await merchant.PutAsync("/api/v1/whatsapp/templates/confirmacion-compra",
            new { enabled = true, metaTemplateName = "compra_recibida", languageCode = "es_AR" });
        _factory.ExternalHttp.OnJson(HttpMethod.Post, messages, new { messages = new[] { new { id = "wamid.mwc" } } });
        var (_, variantId) = await merchant.CreateProductAsync("Mate WA", priceMinor: 9_000_00);
        var shopper = new Shopper(merchant);

        var (orderId, paymentId, _) = await PaidOnsiteAsync(shopper, variantId);
        var sent = Assert.Single(_factory.ExternalHttp.SentTo(messages)).Body!;
        Assert.Contains("compra_recibida", sent, StringComparison.Ordinal);
        Assert.Contains("5491155556666", sent, StringComparison.Ordinal); // el teléfono del checkout
        Assert.Contains("Ana", sent, StringComparison.Ordinal);
        Assert.Contains("ARS 9.000", sent, StringComparison.Ordinal);

        // Llega el aviso del mismo pago: la venta ya estaba pagada, no se repite.
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/v1/payments/{paymentId}", new
        {
            id = paymentId,
            status = "approved",
            status_detail = "accredited",
            external_reference = orderId.ToString(),
            transaction_amount = 9_000m,
            transaction_amount_refunded = 0m,
        });
        await WebhookAsync(paymentId.ToString(), mpUserId);
        await DrainWebhooksAsync();

        // Venta de mostrador: tampoco.
        await merchant.PostAsync("/api/v1/orders/manual", new
        {
            items = new[] { new { variantId, quantity = 1 } },
            paymentMethod = "cash",
            buyerEmail = "mostrador@test.local",
            buyerPhone = "11 5555-4444",
        });
        Assert.Single(_factory.ExternalHttp.SentTo(messages));
    }

    [Fact]
    public async Task Un_reembolso_parcial_que_avisa_Mercado_Pago_tiene_su_nota_de_credito_una_sola_vez()
    {
        // Con emisión automática, el reembolso hecho en la cuenta de MP (que
        // llega por webhook) también emite su NC por lo devuelto; el mismo aviso
        // repetido no emite otra.
        var merchant = await Merchant.CreateAsync(_factory, "mpn");
        var mpUserId = Random.Shared.NextInt64(1_000_000, 9_000_000_000);
        await merchant.ConnectMercadoPagoAsync(mpUserId);
        _ = new FakeArca(_factory.ExternalHttp);
        await merchant.ConfigureFiscalAsync();
        var pos = (await merchant.GetAsync("/api/v1/fiscal/points-of-sale")).GetProperty("items")[0].GetProperty("id").GetGuid();
        await merchant.PutAsync("/api/v1/fiscal/config/emission", new
        {
            autoInvoice = true,
            trigger = "PAYMENT",
            defaultPointOfSaleId = pos,
            consumerFinalThresholdMinorUnits = 0L,
        });
        var (_, variantId) = await merchant.CreateProductAsync("Gorra facturada", priceMinor: 15_000_00);
        var (order, payment, _) = await PaidOnsiteAsync(new Shopper(merchant), variantId);
        await RunFiscalAsync();

        object Payment(string status, decimal refunded) => new
        {
            id = payment,
            status,
            status_detail = status,
            external_reference = order.ToString(),
            transaction_amount = 15_000m,
            transaction_amount_refunded = refunded,
        };

        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/v1/payments/{payment}", Payment("approved", 5_000m));
        await WebhookAsync(payment.ToString(), mpUserId);
        await DrainWebhooksAsync();
        await WebhookAsync(payment.ToString(), mpUserId); // el mismo aviso otra vez
        await DrainWebhooksAsync();
        await RunFiscalAsync();
        Assert.Equal([5_000m], await CreditNotesAsync(order));

        // Después devuelve el resto: la NC por lo que faltaba.
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/v1/payments/{payment}", Payment("refunded", 15_000m));
        await WebhookAsync(payment.ToString(), mpUserId);
        await DrainWebhooksAsync();
        await RunFiscalAsync();
        Assert.Equal([5_000m, 10_000m], await CreditNotesAsync(order));
    }

    private async Task RunFiscalAsync()
    {
        for (var pass = 0; pass < 3; pass++)
            await Workers.RunOnceAsync<Api.Fiscal.FiscalEmissionWorker>(_factory);
    }

    private async Task<List<decimal>> CreditNotesAsync(Guid orderId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<global::Fiscal.Infrastructure.Persistence.FiscalDbContext>();
        return await db.Documents.AsNoTracking()
            .Where(d => d.OrderId == orderId && d.Result == global::Fiscal.Core.Domain.FiscalResult.Authorized
                        && d.CbteTipo == global::Fiscal.Core.Domain.CbteTipo.NotaCreditoB)
            .OrderBy(d => d.ImpTotal).Select(d => d.ImpTotal).ToListAsync();
    }

    /// <summary>Un comprador propio paga con tarjeta en la tienda; devuelve la orden, el pago y su email.</summary>
    private async Task<(Guid Order, long Payment, string Buyer)> PaidOnsiteAsync(Shopper shopper, Guid variantId)
    {
        var buyer = $"reembolso-{Guid.NewGuid():N}@test.local";
        var paymentId = Random.Shared.NextInt64(100_000_000, 999_999_999);
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Api}/v1/payments",
            new { id = paymentId, status = "approved", status_detail = "accredited" });
        var checkoutId = await shopper.CheckoutAsync(variantId, email: buyer);
        var paid = await shopper.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/checkout/{checkoutId}/pay-onsite",
            new { token = "card-token", paymentMethodId = "visa" });
        var orderId = paid.GetProperty("orderId").GetGuid();
        Assert.Equal("PAID", await StatusAsync(shopper, orderId));
        return (orderId, paymentId, buyer);
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

        await merchant.ConnectMercadoPagoAsync(mpUserId);

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
    private Task DrainWebhooksAsync() => MercadoPagoWebhooks.DrainAsync(_factory);

    [Fact]
    public async Task El_nombre_del_resumen_admite_13_y_uno_viejo_mas_largo_no_rompe_el_cobro()
    {
        var merchant = await Merchant.CreateAsync(_factory, "mpsd");
        var mpUserId = Random.Shared.NextInt64(1_000_000, 9_000_000_000);
        await merchant.ConnectMercadoPagoAsync(mpUserId);
        const string prefsUrl = "/api/v1/payments/mercadopago/preferences";

        // La guía de Checkout Pro dice "hasta 13 caracteres".
        var tooLong = await merchant.SendAsync(HttpMethod.Put, prefsUrl, new { checkoutMode = "pro", statementDescriptor = "MI TIENDA ONLINE" });
        Assert.Equal(HttpStatusCode.BadRequest, tooLong.StatusCode);
        Assert.Contains("hasta 13 caracteres", await tooLong.Content.ReadAsStringAsync());
        Assert.Equal("1234567890123", (await merchant.PutAsync(prefsUrl,
            new { checkoutMode = "pro", statementDescriptor = "1234567890123" })).GetProperty("statementDescriptor").GetString());

        // Uno guardado cuando se aceptaban 22: las preferencias se siguen
        // pudiendo guardar sin tocarlo, y el cobro sale con el recortado.
        const string legacy = "MI TIENDA DE ROPA SRL";
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PaymentsDbContext>();
            await db.MercadoPagoConnections.IgnoreQueryFilters()
                .Where(c => c.MercadoPagoUserId == mpUserId)
                .ExecuteUpdateAsync(s => s.SetProperty(c => c.StatementDescriptor, legacy));
        }
        var kept = await merchant.PutAsync(prefsUrl, new { checkoutMode = "pro", statementDescriptor = legacy });
        Assert.Equal(legacy, kept.GetProperty("statementDescriptor").GetString());

        var (_, variantId) = await merchant.CreateProductAsync("Gorra MP", priceMinor: 10_000_00);
        var shopper = new Shopper(merchant);
        var checkoutId = await shopper.CheckoutAsync(variantId);
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Api}/checkout/preferences",
            new { id = "pref-sd", init_point = "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-sd" });
        var pay = await shopper.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/checkout/{checkoutId}/pay", new { returnUrl = shopper.ReturnUrl });
        var orderId = pay.GetProperty("orderId").GetGuid().ToString();

        var preference = _factory.ExternalHttp.SentTo($"{Api}/checkout/preferences")
            .Last(r => r.Headers["X-Idempotency-Key"] == orderId);
        Assert.Contains("\"statement_descriptor\":\"MI TIENDA DE\"", preference.Body);
    }

    private Task<HttpResponseMessage> WebhookAsync(string paymentId, long userId,
        string secret = ApiFactory.MercadoPagoWebhookSecret, string? ts = null) =>
        MercadoPagoWebhooks.SendAsync(_factory, paymentId, userId, secret, ts);

    private static async Task<string?> StatusAsync(Shopper shopper, Guid orderId) =>
        (await shopper.ExpectJsonAsync(HttpMethod.Get, $"/api/v1/orders/{orderId}/status")).GetProperty("status").GetString();
}
