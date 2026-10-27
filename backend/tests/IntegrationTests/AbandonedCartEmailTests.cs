using System.Net;
using System.Net.Http.Json;
using System.Text.RegularExpressions;
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
///
/// <para>
/// Le llega a todo el que dejó su email en el checkout, aunque se haya ido
/// antes de tocar "Pagar", con el link para darse de baja; uno por comprador y
/// nunca a quien terminó comprando.
/// </para>
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
    public async Task Trae_el_link_para_darse_de_baja_y_la_baja_vale_para_el_proximo()
    {
        var (merchant, email, checkoutId) = await AbandonedCartAsync("acu");
        await RunUntilProcessedAsync(checkoutId);

        var mail = Assert.Single(factory.ExternalHttp.EmailsTo(email));
        var token = WebUtility.HtmlDecode(
            Regex.Match(mail.Html, "/api/v1/marketing/unsubscribe\\?token=([^'\"]+)").Groups[1].Value);
        Assert.NotEmpty(token);
        var shopper = new Shopper(merchant);
        await shopper.ExpectOkAsync(HttpMethod.Post, $"/api/v1/marketing/unsubscribe?token={token}");

        // Otra compra a medias del mismo comprador: dado de baja, ya no le llega.
        var (_, variantId) = await merchant.CreateProductAsync("Gorra", priceMinor: 9_000_00);
        var next = await shopper.SaveContactAsync(variantId, email);
        await BackdateAsync(next, hours: 2);
        await RunUntilProcessedAsync(next);
        Assert.Single(factory.ExternalHttp.EmailsTo(email));
    }

    /// <summary>
    /// El checkout guarda el email apenas el comprador lo escribe: quien se va
    /// antes de tocar "Pagar" (por ejemplo, al ver el envío) también recibe el
    /// recordatorio. Antes la compra recién llegaba al servidor al pagar.
    /// </summary>
    [Fact]
    public async Task Quien_se_va_antes_de_pagar_lo_recibe()
    {
        var merchant = await Merchant.CreateAsync(factory, "acc");
        var email = $"mirando-{merchant.Subdomain}@mail.com";
        var (_, variantId) = await merchant.CreateProductAsync("Mochila", priceMinor: 40_000_00);
        var checkoutId = await new Shopper(merchant).SaveContactAsync(variantId, email);
        await BackdateAsync(checkoutId, hours: 2);

        await RunUntilProcessedAsync(checkoutId);

        var mail = Assert.Single(factory.ExternalHttp.EmailsTo(email));
        Assert.Contains("Mochila", mail.Html, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Mientras_sigue_completando_el_checkout_no_sale()
    {
        // Dejó el email hace dos horas, pero hace un rato volvió a tocar algo:
        // la hora se cuenta desde ahí.
        var merchant = await Merchant.CreateAsync(factory, "acv");
        var email = $"vuelve-{merchant.Subdomain}@mail.com";
        var (_, variantId) = await merchant.CreateProductAsync("Mochila", priceMinor: 40_000_00);
        var shopper = new Shopper(merchant);
        var checkoutId = await shopper.SaveContactAsync(variantId, email);
        await BackdateAsync(checkoutId, hours: 2);
        Assert.Equal(checkoutId, await shopper.SaveContactAsync(variantId, email, checkoutId, phone: "1155556666"));

        for (var pass = 0; pass < 20; pass++) await Workers.RunOnceAsync<AbandonedCartWorker>(factory);

        Assert.Empty(factory.ExternalHttp.EmailsTo(email));
        using var scope = factory.Services.CreateScope();
        var session = await scope.ServiceProvider.GetRequiredService<CheckoutDbContext>().Sessions
            .IgnoreQueryFilters().SingleAsync(s => s.Id == checkoutId);
        Assert.Null(session.RecoveryEmailSentAtUtc);
        Assert.Equal("1155556666", session.Phone);
    }

    /// <summary>
    /// Dejó el email, después pagó (acá, una venta registrada con su email; con
    /// transferencia o tarjeta es lo mismo): no se le recuerda nada. Antes cada
    /// compra a medias contaba sola, y a quien reintentaba y pagaba le llegaba
    /// igual "¿Te quedó algo en el carrito?".
    /// </summary>
    [Fact]
    public async Task Si_compro_despues_no_lo_recibe_ni_aparece_en_el_panel()
    {
        var merchant = await Merchant.CreateAsync(factory, "acb");
        var email = $"compro-{merchant.Subdomain}@mail.com";
        var (_, variantId) = await merchant.CreateProductAsync("Mochila", priceMinor: 40_000_00);
        var checkoutId = await new Shopper(merchant).SaveContactAsync(variantId, email);
        await BackdateAsync(checkoutId, hours: 2);
        await merchant.CreateSaleAsync(buyerEmail: email.ToUpperInvariant());

        await RunUntilProcessedAsync(checkoutId);

        Assert.DoesNotContain(factory.ExternalHttp.EmailsTo(email), m => m.Subject.Contains("carrito", StringComparison.Ordinal));
        var carts = await merchant.GetAsync("/api/v1/stats/abandoned-carts?days=30");
        Assert.Equal(0, carts.GetProperty("count").GetInt32());
    }

    /// <summary>
    /// Pagar por transferencia deja un pedido esperando el pago, con sus propios
    /// avisos (los datos para pagar, el vencimiento). Antes, a la hora le
    /// llegaba además "¿Te quedó algo en el carrito?".
    /// </summary>
    [Fact]
    public async Task Un_pedido_por_transferencia_no_es_un_carrito_abandonado()
    {
        var merchant = await Merchant.CreateAsync(factory, "act");
        await merchant.PutAsync("/api/v1/admin/payments/options", new
        {
            transferEnabled = true,
            discountPercent = 0,
            bankName = "Banco Nación",
            accountHolder = "Tienda de Test SRL",
            holderTaxId = "30-71234567-8",
            cbu = "0110599520000012345678",
            alias = "TIENDA.TEST.PAGOS",
            instructions = "Mandanos el comprobante por WhatsApp.",
            holdHours = 48,
            cashOnPickupEnabled = false,
            installmentsMax = 6,
            installmentsNote = "Con tarjetas de crédito bancarias.",
        });
        var email = $"transfiere-{merchant.Subdomain}@mail.com";
        var (_, variantId) = await merchant.CreateProductAsync("Mochila", priceMinor: 40_000_00);
        var shopper = new Shopper(merchant);
        var checkoutId = await shopper.CheckoutAsync(variantId, email: email);
        await shopper.ExpectOkAsync(HttpMethod.Post, $"/api/v1/checkout/{checkoutId}/pay-offline", new { method = "transfer" });
        await BackdateAsync(checkoutId, hours: 2);

        await RunUntilProcessedAsync(checkoutId);

        Assert.DoesNotContain(factory.ExternalHttp.EmailsTo(email), m => m.Subject.Contains("carrito", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Varias_compras_a_medias_del_mismo_comprador_un_solo_recordatorio()
    {
        // Armó una compra, cambió el carrito (otra compra) y se fue: un solo
        // recordatorio, con lo último que dejó.
        var merchant = await Merchant.CreateAsync(factory, "ac2");
        var email = $"duda-{merchant.Subdomain}@mail.com";
        var (_, mochila) = await merchant.CreateProductAsync("Mochila", priceMinor: 40_000_00);
        var (_, gorra) = await merchant.CreateProductAsync("Gorra", priceMinor: 9_000_00);
        var shopper = new Shopper(merchant);
        var first = await shopper.SaveContactAsync(mochila, email);
        var second = await shopper.SaveContactAsync(gorra, email, checkoutId: first);
        Assert.NotEqual(first, second); // otro carrito: otra compra
        await BackdateAsync(first, hours: 3);
        await BackdateAsync(second, hours: 2);

        await RunUntilProcessedAsync(first);
        await RunUntilProcessedAsync(second);

        var mail = Assert.Single(factory.ExternalHttp.EmailsTo(email));
        Assert.Contains("Gorra", mail.Html, StringComparison.Ordinal);
        Assert.DoesNotContain("Mochila", mail.Html, StringComparison.Ordinal);
        var carts = await merchant.GetAsync("/api/v1/stats/abandoned-carts?days=30");
        Assert.Equal(1, carts.GetProperty("count").GetInt32());
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
    /// quien tildó el aviso por WhatsApp junto al teléfono y no se dio de baja
    /// de las novedades de la tienda. Antes salía a cualquiera que hubiera
    /// dejado su teléfono para el envío. El email no depende de eso.
    /// </summary>
    [Fact]
    public async Task El_WhatsApp_sale_solo_con_consentimiento()
    {
        // Sin tildar: el WhatsApp no sale; el email, sí.
        var (silent, silentEmail, silentCheckout) = await AbandonedCartAsync("acw1", acceptsWhatsApp: false);
        var silentMessages = await ConnectWhatsAppAsync(silent);
        await RunUntilProcessedAsync(silentCheckout);
        Assert.Empty(factory.ExternalHttp.SentTo(silentMessages));
        Assert.Single(factory.ExternalHttp.EmailsTo(silentEmail));

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

    /// <summary>
    /// El checkout guarda el email apenas se escribe, sin verificarlo: con eso
    /// alguien podía hacerle llegar un recordatorio tras otro a una casilla
    /// ajena armando compras a su nombre. Ahora sale uno por email y tienda
    /// cada siete días; la compra igual queda procesada.
    /// </summary>
    [Fact]
    public async Task Un_recordatorio_por_email_cada_siete_dias()
    {
        var (merchant, email, first) = await AbandonedCartAsync("acl");
        await RunUntilProcessedAsync(first);
        Assert.Single(factory.ExternalHttp.EmailsTo(email));

        var (_, variantId) = await merchant.CreateProductAsync("Valija", priceMinor: 90_000_00);
        var second = await new Shopper(merchant).CheckoutAsync(variantId, email: email.ToUpperInvariant());
        await BackdateAsync(second, hours: 2);
        await RunUntilProcessedAsync(second);

        Assert.Single(factory.ExternalHttp.EmailsTo(email));
    }

    [Fact]
    public async Task Guardar_el_email_tiene_cupo_por_IP()
    {
        // Cada guardado puede terminar en un recordatorio a ese email: sin cupo,
        // alguien podría cargar emails ajenos en masa. Con un cupo de 2, el
        // tercero de la misma IP se frena (los rechazados también cuentan).
        await using var app = factory.WithWebHostBuilder(b =>
            b.UseSetting("RateLimiting:CheckoutContactPermitLimit", "2"));
        var client = app.CreateClient();
        var statuses = new List<HttpStatusCode>();
        for (var i = 0; i < 3; i++)
            statuses.Add((await client.PostAsJsonAsync("/api/v1/checkout/contact", new { email = "no-es-un-email" })).StatusCode);

        Assert.DoesNotContain(HttpStatusCode.TooManyRequests, statuses.Take(2));
        Assert.Equal(HttpStatusCode.TooManyRequests, statuses[2]);
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
    /// <param name="acceptsWhatsApp">Si el comprador tildó el aviso por WhatsApp.</param>
    private async Task<(Merchant Merchant, string Email, Guid CheckoutId)> AbandonedCartAsync(
        string tag, bool upperCase = false, string? address = null, bool acceptsWhatsApp = true)
    {
        var merchant = await Merchant.CreateAsync(factory, tag);
        var email = address ?? $"indeciso-{merchant.Subdomain}@mail.com";
        var (_, variantId) = await merchant.CreateProductAsync("Mochila", priceMinor: 40_000_00);
        var checkoutId = await new Shopper(merchant).CheckoutAsync(variantId,
            email: upperCase ? email.ToUpperInvariant() : email, acceptsWhatsApp: acceptsWhatsApp);
        await BackdateAsync(checkoutId, hours: 2);
        return (merchant, email, checkoutId);
    }

    /// <summary>La compra se armó y se tocó por última vez hace tantas horas.</summary>
    private async Task BackdateAsync(Guid checkoutId, int hours)
    {
        var at = DateTime.UtcNow.AddHours(-hours);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CheckoutDbContext>();
        await db.Sessions.IgnoreQueryFilters().Where(s => s.Id == checkoutId)
            .ExecuteUpdateAsync(s => s
                .SetProperty(x => x.CreatedAtUtc, at)
                .SetProperty(x => x.LastActivityAtUtc, at));
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
