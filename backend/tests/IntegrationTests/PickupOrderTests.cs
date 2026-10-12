using System.Net;

namespace IntegrationTests;

/// <summary>
/// Retiro en el local: la orden guarda que es de retiro (lo dice el medio que
/// eligió el comprador) y "despacharla" avisa "listo para retirar" —por email
/// y por WhatsApp—, no "en camino". Un pedido con envío sigue igual.
/// </summary>
[Collection("api")]
public sealed class PickupOrderTests(ApiFactory factory)
{
    private const string WhatsAppGraph = "https://graph.facebook.com/v20.0";

    [Fact]
    public async Task Al_despachar_un_retiro_se_avisa_listo_para_retirar()
    {
        var merchant = await Merchant.CreateAsync(factory, "pku");
        var phoneNumberId = $"pn{Guid.NewGuid():N}"[..14];
        var messages = $"{WhatsAppGraph}/{phoneNumberId}/messages";
        await merchant.ExpectOkAsync(HttpMethod.Put, "/api/v1/whatsapp/connection", new { phoneNumberId, accessToken = "EAAG-pku" });
        await merchant.PutAsync("/api/v1/whatsapp/templates/lista-para-retirar",
            new { enabled = true, metaTemplateName = "listo_para_retirar", languageCode = "es_AR" });
        await merchant.PutAsync("/api/v1/whatsapp/templates/confirmacion-envio",
            new { enabled = true, metaTemplateName = "pedido_en_camino", languageCode = "es_AR" });
        factory.ExternalHttp.OnJson(HttpMethod.Post, messages, new { messages = new[] { new { id = "wamid.pku" } } });

        await merchant.PutAsync("/api/v1/payments/payway/connection", new { siteId = "1", environment = "SANDBOX", publicKey = "pub", privateKey = "priv" });
        factory.ExternalHttp.On(HttpMethod.Post, $"{Payments.Core.Domain.PaywayConnection.SandboxBaseUrl}/payments", (_, _) =>
            FakeHttp.Json(new { id = Random.Shared.Next(), status = "approved", amount = 10_000_00L }, HttpStatusCode.Created));
        var (_, variantId) = await merchant.CreateProductAsync("Termo", priceMinor: 10_000_00, stock: 5);
        var pickup = (await merchant.PostAsync("/api/v1/admin/shipping/methods",
            new { name = "Retiro en el local", kind = "pickup", price = 0m, pickupAddress = "Av. Corrientes 1234" })).GetProperty("id").GetGuid();
        var delivery = (await merchant.PostAsync("/api/v1/admin/shipping/methods",
            new { name = "Moto", kind = "delivery", price = 0m })).GetProperty("id").GetGuid();

        var shopper = new Shopper(merchant);
        async Task<Guid> BuyAsync(Guid methodId, string email, string? address = null)
        {
            var checkoutId = await shopper.CheckoutAsync(variantId, shippingMethodId: methodId, address: address, email: email);
            var paid = await shopper.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/checkout/{checkoutId}/pay-payway",
                new { token = "tok", bin = "450799", installments = 1, isDebit = false });
            return paid.GetProperty("orderId").GetGuid();
        }
        string[] EmailsTo(string email) => factory.ExternalHttp.SentTo(ApiFactory.ResendEmails)
            .Where(r => r.Body!.Contains(email)).Select(r => r.Body!).ToArray();

        // Retiro: la orden lo sabe, y el aviso es "listo para retirar".
        var pickupEmail = $"retiro-{merchant.Subdomain}@test.local";
        var pickupOrder = await BuyAsync(pickup, pickupEmail);
        Assert.True((await merchant.GetAsync($"/api/v1/orders/{pickupOrder}")).GetProperty("isPickup").GetBoolean());
        await merchant.PostAsync($"/api/v1/orders/{pickupOrder}/fulfill", new { tracking = (string?)null });

        Assert.Contains(EmailsTo(pickupEmail), b => b.Contains("listo para retirar"));
        Assert.DoesNotContain(EmailsTo(pickupEmail), b => b.Contains("Despachamos tu pedido"));
        Assert.Single(factory.ExternalHttp.SentTo(messages), r => r.Body!.Contains("listo_para_retirar"));
        Assert.DoesNotContain(factory.ExternalHttp.SentTo(messages), r => r.Body!.Contains("pedido_en_camino"));

        // Envío: igual que siempre.
        var deliveryEmail = $"envio-{merchant.Subdomain}@test.local";
        var deliveryOrder = await BuyAsync(delivery, deliveryEmail, address: "San Martín 100");
        Assert.False((await merchant.GetAsync($"/api/v1/orders/{deliveryOrder}")).GetProperty("isPickup").GetBoolean());
        await merchant.PostAsync($"/api/v1/orders/{deliveryOrder}/fulfill", new { tracking = "AR999" });

        Assert.Contains(EmailsTo(deliveryEmail), b => b.Contains("Despachamos tu pedido"));
        Assert.DoesNotContain(EmailsTo(deliveryEmail), b => b.Contains("listo para retirar"));
        Assert.Single(factory.ExternalHttp.SentTo(messages), r => r.Body!.Contains("pedido_en_camino") && r.Body.Contains("AR999"));
    }
}
