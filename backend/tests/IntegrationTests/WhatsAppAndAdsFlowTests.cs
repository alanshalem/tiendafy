using System.Net;
using System.Web;
using Microsoft.AspNetCore.Mvc.Testing;

namespace IntegrationTests;

/// <summary>
/// WhatsApp Cloud API (conectar, probar, plantillas y los avisos que salen
/// solos con cada venta) y Meta Ads (OAuth, cuenta publicitaria y gasto por
/// campaña), con Meta simulado en <see cref="FakeHttp"/>.
/// </summary>
[Collection("api")]
public sealed class WhatsAppAndAdsFlowTests
{
    private const string WhatsAppGraph = "https://graph.facebook.com/v20.0";
    private const string Graph = "https://graph.facebook.com/v21.0";
    private readonly ApiFactory _factory;

    public WhatsAppAndAdsFlowTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task WhatsApp_conectar_probar_y_avisos_de_venta()
    {
        var merchant = await Merchant.CreateAsync(_factory, "wa");
        var phoneNumberId = $"pn{Guid.NewGuid():N}"[..14];

        Assert.False((await merchant.GetAsync("/api/v1/whatsapp/connection")).GetProperty("connected").GetBoolean());
        Assert.Equal(HttpStatusCode.Conflict, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/whatsapp/test", new { to = "11 2345-6789" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Put, "/api/v1/whatsapp/connection", new { phoneNumberId = "" })).StatusCode);

        await merchant.ExpectOkAsync(HttpMethod.Put, "/api/v1/whatsapp/connection",
            new { phoneNumberId, accessToken = "EAAG-wa-token", displayPhoneNumber = "+54 9 11 2345-6789" });
        var connection = await merchant.GetAsync("/api/v1/whatsapp/connection");
        Assert.True(connection.GetProperty("connected").GetBoolean());
        Assert.DoesNotContain("EAAG", connection.ToString()); // el token no vuelve

        // Mensaje de prueba: el número se normaliza a E.164 argentino.
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/whatsapp/test", new { to = "123" })).StatusCode);
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{WhatsAppGraph}/{phoneNumberId}/messages", new { messages = new[] { new { id = "wamid.1" } } });
        var test = await merchant.PostAsync("/api/v1/whatsapp/test", new { to = "11 2345-6789" });
        Assert.Equal("5491123456789", test.GetProperty("to").GetString());
        var sent = _factory.ExternalHttp.SentTo($"{WhatsAppGraph}/{phoneNumberId}/messages").Last();
        Assert.Equal("Bearer EAAG-wa-token", sent.Headers["Authorization"]);
        Assert.Contains("hello_world", sent.Body);

        // Meta rechaza (token vencido): el panel lo explica.
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{WhatsAppGraph}/{phoneNumberId}/messages",
            new { error = new { code = 190, message = "token expirado" } }, HttpStatusCode.Unauthorized);
        Assert.Equal(HttpStatusCode.BadGateway, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/whatsapp/test", new { to = "1123456789" })).StatusCode);
        _factory.ExternalHttp.OnJson(HttpMethod.Post, $"{WhatsAppGraph}/{phoneNumberId}/messages", new { messages = new[] { new { id = "wamid.2" } } });

        // Plantillas: activar los avisos de pago y de envío con su nombre en Meta.
        var templates = await merchant.GetAsync("/api/v1/whatsapp/templates");
        Assert.NotEmpty(templates.GetProperty("items").EnumerateArray());
        Assert.Equal(HttpStatusCode.NotFound, (await merchant.SendAsync(HttpMethod.Put, "/api/v1/whatsapp/templates/no-existe", new { enabled = true })).StatusCode);
        await merchant.PutAsync("/api/v1/whatsapp/templates/confirmacion-pago",
            new { enabled = true, metaTemplateName = "pago_confirmado", languageCode = "es_AR" });
        await merchant.PutAsync("/api/v1/whatsapp/templates/confirmacion-envio",
            new { enabled = true, metaTemplateName = "pedido_enviado", languageCode = "es_AR" });

        // Una compra de la tienda (cobrada con Payway) avisa sola; al
        // despacharla, otra vez. Las ventas de mostrador no: el comprador está ahí.
        var (_, variantId) = await merchant.CreateProductAsync("Remera WA", priceMinor: 10_000_00);
        await merchant.PutAsync("/api/v1/payments/payway/connection", new { siteId = "1", environment = "SANDBOX", publicKey = "pub", privateKey = "priv" });
        _factory.ExternalHttp.On(HttpMethod.Post, $"{Payments.Core.Domain.PaywayConnection.SandboxBaseUrl}/payments", (_, _) =>
            FakeHttp.Json(new { id = Random.Shared.Next(), status = "approved", amount = 10_000_00L }, HttpStatusCode.Created));
        var shopper = new Shopper(merchant);
        var checkoutId = await shopper.CheckoutAsync(variantId);
        var paid = await shopper.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/checkout/{checkoutId}/pay-payway",
            new { token = "tok", bin = "450799", installments = 1, isDebit = false });
        var paidMessage = Assert.Single(_factory.ExternalHttp.SentTo($"{WhatsAppGraph}/{phoneNumberId}/messages"), r => r.Body!.Contains("pago_confirmado"));
        Assert.Contains("5491155556666", paidMessage.Body); // el teléfono del checkout, normalizado
        await merchant.PostAsync($"/api/v1/orders/{paid.GetProperty("orderId").GetGuid()}/fulfill", new { tracking = "AR123" });
        Assert.Contains(_factory.ExternalHttp.SentTo($"{WhatsAppGraph}/{phoneNumberId}/messages"), r => r.Body!.Contains("pedido_enviado") && r.Body.Contains("AR123"));

        await merchant.CreateSaleAsync();
        Assert.Single(_factory.ExternalHttp.SentTo($"{WhatsAppGraph}/{phoneNumberId}/messages"), r => r.Body!.Contains("pago_confirmado"));

        // Uso del mes (lo que cuesta).
        var usage = await merchant.GetAsync("/api/v1/notifications/usage");
        Assert.True(usage.GetProperty("whatsapp").GetProperty("month").GetInt32() >= 2);

        await merchant.ExpectOkAsync(HttpMethod.Delete, "/api/v1/whatsapp/connection");
        Assert.False((await merchant.GetAsync("/api/v1/whatsapp/connection")).GetProperty("connected").GetBoolean());
    }

    [Fact]
    public async Task Meta_Ads_conectar_elegir_cuenta_y_ver_el_gasto()
    {
        var merchant = await Merchant.CreateAsync(_factory, "ads");

        Assert.Equal(HttpStatusCode.Conflict, (await merchant.SendAsync(HttpMethod.Get, "/api/v1/meta-ads/ad-accounts")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await merchant.SendAsync(HttpMethod.Get, "/api/v1/meta-ads/spend")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/meta-ads/ad-account", new { adAccountId = "act_1" })).StatusCode);

        // OAuth: code → token → token largo.
        var connect = await merchant.PostAsync("/api/v1/meta-ads/connect", new { });
        var state = HttpUtility.ParseQueryString(new Uri(connect.GetProperty("authUrl").GetString()!).Query)["state"]!;
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Graph}/oauth/access_token", new { access_token = "EAAG-ads", expires_in = 5_184_000 });
        var browser = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var callback = await browser.GetAsync($"/api/v1/meta-ads/oauth/callback?code=c&state={Uri.EscapeDataString(state)}");
        Assert.Contains("connected", callback.Headers.Location!.ToString());
        Assert.Contains("error", (await browser.GetAsync("/api/v1/meta-ads/oauth/callback")).Headers.Location!.ToString());
        Assert.Contains("error", (await browser.GetAsync("/api/v1/meta-ads/oauth/callback?code=c&state=trucho")).Headers.Location!.ToString());

        var status = await merchant.GetAsync("/api/v1/meta-ads/status");
        Assert.True(status.GetProperty("connected").GetBoolean());

        // Cuentas publicitarias y elegir una.
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Graph}/me/adaccounts", new
        {
            data = new[] { new { id = "act_111", name = "Tienda principal" }, new { id = "act_222", name = "Pruebas" } },
        });
        Assert.Equal(2, (await merchant.GetAsync("/api/v1/meta-ads/ad-accounts")).GetProperty("items").GetArrayLength());
        Assert.Equal(HttpStatusCode.Conflict, (await merchant.SendAsync(HttpMethod.Get, "/api/v1/meta-ads/spend")).StatusCode); // sin cuenta elegida
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/meta-ads/ad-account", new { adAccountId = "" })).StatusCode);
        await merchant.PostAsync("/api/v1/meta-ads/ad-account", new { adAccountId = "act_111", name = "Tienda principal" });

        // Gasto por campaña, en centavos.
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Graph}/act_111/insights", new
        {
            data = new[]
            {
                new { campaign_id = "c1", campaign_name = "Hot Sale", spend = "12500.50" },
                new { campaign_id = "c2", campaign_name = "Remarketing", spend = "3000" },
            },
        });
        var spend = await merchant.GetAsync("/api/v1/meta-ads/spend?from=2026-10-01&to=2026-10-11");
        Assert.Equal(15_500_50, spend.GetProperty("spendTotal").GetInt64());
        Assert.Contains("time_range", _factory.ExternalHttp.SentTo($"{Graph}/act_111/insights").Last().Uri.ToString());

        // Meta caído.
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Graph}/act_111/insights", new { error = new { message = "boom" } }, HttpStatusCode.InternalServerError);
        Assert.False((await merchant.SendAsync(HttpMethod.Get, "/api/v1/meta-ads/spend")).IsSuccessStatusCode);
        _factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Graph}/me/adaccounts", new { error = new { message = "boom" } }, HttpStatusCode.InternalServerError);
        Assert.False((await merchant.SendAsync(HttpMethod.Get, "/api/v1/meta-ads/ad-accounts")).IsSuccessStatusCode);

        await merchant.ExpectOkAsync(HttpMethod.Delete, "/api/v1/meta-ads/connection");
        await merchant.ExpectOkAsync(HttpMethod.Delete, "/api/v1/meta-ads/connection");
    }
}
