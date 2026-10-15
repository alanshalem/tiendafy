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

    // ---------------------------------------------------------------- helpers

    /// <summary>Una tienda con un checkout completo y sin pagar de hace dos horas.</summary>
    private async Task<(Merchant Merchant, string Email, Guid CheckoutId)> AbandonedCartAsync(
        string tag, bool upperCase = false, string? address = null)
    {
        var merchant = await Merchant.CreateAsync(factory, tag);
        var email = address ?? $"indeciso-{merchant.Subdomain}@mail.com";
        var (_, variantId) = await merchant.CreateProductAsync("Mochila", priceMinor: 40_000_00);
        var checkoutId = await new Shopper(merchant).CheckoutAsync(variantId,
            email: upperCase ? email.ToUpperInvariant() : email);

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
