using Api.Notifications;
using Checkout.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Notifications.Infrastructure;

namespace IntegrationTests;

/// <summary>
/// El email de carrito abandonado sale con la plantilla "carritos-abandonados"
/// de la tienda y nunca a una dirección suprimida. Antes el worker mandaba un
/// texto fijo, a todas las tiendas y sin mirar la lista de supresión: editar
/// o apagar la plantilla en el panel no cambiaba nada, y quien se había dado
/// de baja (o cuyo email rebotó) lo recibía igual.
/// </summary>
[Collection("api")]
public sealed class AbandonedCartEmailTests(ApiFactory factory)
{
    [Fact]
    public async Task Sale_con_la_plantilla_que_edito_la_tienda()
    {
        var (merchant, email, checkoutId) = await AbandonedCartAsync("acp");
        var saved = await merchant.PutAsync($"/api/v1/email-templates/{AbandonedCartWorker.Template}", new
        {
            enabled = true,
            subject = "{{store}} te guarda el carrito",
            bodyHtml = "<p>Hola {{name}}, esto te espera:</p>{{items}}<p><a href=\"{{link}}\">Terminar la compra</a></p>",
        });
        Assert.True(saved.GetProperty("enabled").GetBoolean());

        await RunUntilProcessedAsync(checkoutId);

        var mail = Assert.Single(factory.ExternalHttp.EmailsTo(email));
        Assert.Equal($"Tienda {merchant.Subdomain} te guarda el carrito", mail.Subject);
        Assert.Contains("Hola Ana, esto te espera:", mail.Html, StringComparison.Ordinal);
        Assert.Contains("Mochila", mail.Html, StringComparison.Ordinal);          // {{items}}
        Assert.Contains("ARS 40.000", mail.Html, StringComparison.Ordinal);
        Assert.Contains($"{merchant.Subdomain}.", mail.Html, StringComparison.Ordinal); // {{link}} a la tienda
        Assert.Equal(merchant.TenantId.ToString(), mail.TenantTag);
    }

    [Fact]
    public async Task Sin_tocar_la_plantilla_sale_igual_que_antes()
    {
        // La tienda que nunca abrió la plantilla la sigue mandando (viene prendida).
        var (merchant, email, checkoutId) = await AbandonedCartAsync("acd");
        await RunUntilProcessedAsync(checkoutId);

        var mail = Assert.Single(factory.ExternalHttp.EmailsTo(email));
        Assert.Equal($"¿Te quedó algo en el carrito de Tienda {merchant.Subdomain}?", mail.Subject);
        Assert.Contains("Mochila", mail.Html, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Apagada_no_sale_y_el_carrito_no_se_vuelve_a_mirar()
    {
        var (merchant, email, checkoutId) = await AbandonedCartAsync("aco");
        await merchant.PutAsync($"/api/v1/email-templates/{AbandonedCartWorker.Template}", new { enabled = false });

        await RunUntilProcessedAsync(checkoutId);
        Assert.Empty(factory.ExternalHttp.EmailsTo(email));
    }

    [Fact]
    public async Task Una_direccion_suprimida_no_lo_recibe()
    {
        // Se dio de baja de una campaña (o rebotó): la supresión se guarda en
        // minúsculas y el checkout la escribió con mayúsculas.
        var (merchant, email, checkoutId) = await AbandonedCartAsync("acs", upperCase: true);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<NotificationsDbContext>();
            db.EmailSuppressions.Add(EmailSuppression.Create(merchant.TenantId, email, "unsubscribe"));
            await db.SaveChangesAsync();
        }

        await RunUntilProcessedAsync(checkoutId);
        Assert.Empty(factory.ExternalHttp.EmailsTo(email));

        // La supresión es por tienda: en otra tienda la misma persona sí lo recibe.
        var (_, otherEmail, otherCheckout) = await AbandonedCartAsync("acs2", address: email);
        await RunUntilProcessedAsync(otherCheckout);
        Assert.Single(factory.ExternalHttp.EmailsTo(otherEmail));
    }

    /// <summary>
    /// El WhatsApp de carrito abandonado es marketing para Meta: sale solo a
    /// quien tildó "Quiero recibir novedades" en el checkout y no se dio de baja
    /// de las novedades de la tienda. Antes salía a cualquiera que hubiera
    /// dejado su teléfono para el envío.
    /// </summary>
    [Fact]
    public async Task El_WhatsApp_sale_solo_con_consentimiento()
    {
        // Sin tildar: no sale.
        var (silent, _, silentCheckout) = await AbandonedCartAsync("acw1", acceptsMarketing: false);
        var silentMessages = await ConnectWhatsAppAsync(silent);
        await RunUntilProcessedAsync(silentCheckout);
        Assert.Empty(factory.ExternalHttp.SentTo(silentMessages));

        // Tildó, pero después se dio de baja de las novedades: tampoco.
        var (unsubscribed, unsubscribedEmail, unsubscribedCheckout) = await AbandonedCartAsync("acw2");
        var unsubscribedMessages = await ConnectWhatsAppAsync(unsubscribed);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<NotificationsDbContext>();
            db.EmailSuppressions.Add(EmailSuppression.Create(unsubscribed.TenantId, unsubscribedEmail, "unsubscribe"));
            await db.SaveChangesAsync();
        }
        await RunUntilProcessedAsync(unsubscribedCheckout);
        Assert.Empty(factory.ExternalHttp.SentTo(unsubscribedMessages));

        // Tildó y sigue suscripto: sale, al teléfono que dejó.
        var (agreed, _, agreedCheckout) = await AbandonedCartAsync("acw3");
        var agreedMessages = await ConnectWhatsAppAsync(agreed);
        await RunUntilProcessedAsync(agreedCheckout);
        var body = Assert.Single(factory.ExternalHttp.SentTo(agreedMessages)).Body!;
        Assert.Contains("carrito_olvidado", body, StringComparison.Ordinal);
        Assert.Contains("5491155556666", body, StringComparison.Ordinal);
    }

    // ---------------------------------------------------------------- helpers

    /// <summary>WhatsApp conectado con la plantilla de carrito abandonado prendida; devuelve la URL de envío.</summary>
    private async Task<string> ConnectWhatsAppAsync(Merchant merchant)
    {
        var phoneNumberId = $"pn{Guid.NewGuid():N}"[..14];
        var messages = $"{Api.MetaAds.MetaGraph.ApiBaseUrl}/{phoneNumberId}/messages";
        await merchant.ExpectOkAsync(HttpMethod.Put, "/api/v1/whatsapp/connection", new { phoneNumberId, accessToken = "EAAG-acw" });
        await merchant.PutAsync("/api/v1/whatsapp/templates/carritos-abandonados",
            new { enabled = true, metaTemplateName = "carrito_olvidado", languageCode = "es_AR" });
        factory.ExternalHttp.OnJson(HttpMethod.Post, messages, new { messages = new[] { new { id = "wamid.acw" } } });
        return messages;
    }

    /// <summary>Una tienda con un checkout completo y sin pagar de hace dos horas.</summary>
    /// <param name="acceptsMarketing">Si el comprador tildó "Quiero recibir novedades".</param>
    private async Task<(Merchant Merchant, string Email, Guid CheckoutId)> AbandonedCartAsync(
        string tag, bool upperCase = false, string? address = null, bool acceptsMarketing = true)
    {
        var merchant = await Merchant.CreateAsync(factory, tag);
        var email = address ?? $"indeciso-{merchant.Subdomain}@mail.com";
        var (_, variantId) = await merchant.CreateProductAsync("Mochila", priceMinor: 40_000_00);
        var checkoutId = await new Shopper(merchant).CheckoutAsync(variantId,
            email: upperCase ? email.ToUpperInvariant() : email, acceptsMarketing: acceptsMarketing);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CheckoutDbContext>();
        await db.Sessions.IgnoreQueryFilters().Where(s => s.Id == checkoutId)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.CreatedAtUtc, DateTime.UtcNow.AddHours(-2)));
        return (merchant, email, checkoutId);
    }

    /// <summary>
    /// El worker toma los carritos de a 50, los más viejos primero, de TODA la
    /// base (que persiste entre corridas): puede tener que despachar otros antes.
    /// </summary>
    private async Task RunUntilProcessedAsync(Guid checkoutId)
    {
        for (var pass = 0; pass < 20; pass++)
        {
            await Workers.RunOnceAsync<AbandonedCartWorker>(factory);
            using var scope = factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<CheckoutDbContext>();
            if (await db.Sessions.IgnoreQueryFilters().AnyAsync(s => s.Id == checkoutId && s.RecoveryEmailSentAtUtc != null)) return;
        }
        Assert.Fail("El carrito abandonado nunca se procesó.");
    }
}
