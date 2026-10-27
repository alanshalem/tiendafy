using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.DependencyInjection;
using Notifications.Infrastructure;

namespace IntegrationTests;

/// <summary>
/// Los emails de la cuenta del comprador (verificar el email, cambiar la
/// contraseña) salen con las plantillas "activacion-cuenta" y
/// "cambio-contrasena" de la tienda. Antes salían con un texto fijo y editar
/// esas plantillas en el panel no cambiaba nada. Son de seguridad: la tienda
/// les cambia el texto pero no las puede apagar, y si borra el link del
/// cuerpo, el link se agrega igual.
/// </summary>
[Collection("api")]
public sealed partial class ShopAuthEmailTemplateTests(ApiFactory factory)
{
    private static JsonElement? Template(JsonElement list, string type) =>
        list.GetProperty("items").EnumerateArray()
            .Select(t => (JsonElement?)t)
            .FirstOrDefault(t => t!.Value.GetProperty("type").GetString() == type);

    [Fact]
    public async Task El_catalogo_lista_solo_las_que_se_mandan()
    {
        var merchant = await Merchant.CreateAsync(factory, "sat");

        // Una fila guardada de una clave que ya no existe (antes "bienvenida"
        // se podía editar) no rompe el listado: se ignora.
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<NotificationsDbContext>();
            db.EmailTemplates.Add(EmailTemplate.Create(merchant.TenantId, "bienvenida", true, "Hola", "<p>Hola</p>"));
            db.EmailTemplates.Add(EmailTemplate.Create(merchant.TenantId, "confirmacion-compra", true, "Pedido", "<p>Pedido</p>"));
            await db.SaveChangesAsync();
        }

        var list = await merchant.GetAsync("/api/v1/email-templates");
        Assert.Null(Template(list, "bienvenida"));
        Assert.Null(Template(list, "confirmacion-compra"));
        Assert.Equal(HttpStatusCode.NotFound,
            (await merchant.SendAsync(HttpMethod.Put, "/api/v1/email-templates/bienvenida", new { enabled = true })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await merchant.SendAsync(HttpMethod.Put, "/api/v1/email-templates/confirmacion-compra", new { enabled = true })).StatusCode);

        foreach (var type in new[] { "activacion-cuenta", "cambio-contrasena", "intento-registro" })
        {
            var t = Template(list, type)!.Value;
            Assert.True(t.GetProperty("alwaysOn").GetBoolean());
            Assert.True(t.GetProperty("enabled").GetBoolean());
        }
        // Carritos abandonados: se puede apagar, y viene prendida (el worker ya la mandaba).
        var carts = Template(list, "carritos-abandonados")!.Value;
        Assert.False(carts.GetProperty("alwaysOn").GetBoolean());
        Assert.True(carts.GetProperty("enabled").GetBoolean());
    }

    [Fact]
    public async Task La_verificacion_sale_con_el_texto_de_la_tienda_y_no_se_apaga()
    {
        var merchant = await Merchant.CreateAsync(factory, "sav");
        var saved = await merchant.PutAsync("/api/v1/email-templates/activacion-cuenta", new
        {
            enabled = false, // no se puede: un email de seguridad no se apaga
            subject = "{{name}}, confirmá tu email en {{store}}",
            bodyHtml = "<p>Hola {{name}}, gracias por sumarte.</p><p><a href=\"{{link}}\">Confirmar mi email</a></p>",
        });
        Assert.True(saved.GetProperty("enabled").GetBoolean());
        Assert.True(saved.GetProperty("alwaysOn").GetBoolean());

        var shopper = new Shopper(merchant);
        var email = $"nueva-{merchant.Subdomain}@mail.com";
        await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/shop/auth/register",
            new { name = "José <b>Pérez</b>", email, password = "una-clave-larga" });

        var mail = Assert.Single(factory.ExternalHttp.EmailsTo(email));
        // El asunto es texto plano: sin entidades HTML ("Jos&#233;").
        Assert.Equal($"José <b>Pérez</b>, confirmá tu email en Tienda {merchant.Subdomain}", mail.Subject);
        Assert.Contains("gracias por sumarte", mail.Html, StringComparison.Ordinal);
        Assert.Contains("&lt;b&gt;P", mail.Html, StringComparison.Ordinal); // en el cuerpo, el nombre no inyecta HTML
        Assert.DoesNotContain("<b>P", mail.Html, StringComparison.Ordinal);
        // El link de la plantilla sobrevivió al sanitizado: no hizo falta agregar el botón.
        Assert.DoesNotContain("O copiá este link", mail.Html, StringComparison.Ordinal);
        Assert.Contains($"{shopper.ReturnUrl}/cuenta/verificar?token=", mail.Html, StringComparison.Ordinal);

        await shopper.ExpectOkAsync(HttpMethod.Post, "/api/v1/shop/auth/verify", new { token = TokenFrom(mail.Html) });
    }

    [Fact]
    public async Task Si_la_tienda_borra_el_link_del_cambio_de_contrasena_se_agrega_igual()
    {
        var merchant = await Merchant.CreateAsync(factory, "sar");
        var shopper = new Shopper(merchant);
        var email = $"olvido-{merchant.Subdomain}@mail.com";
        await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/shop/auth/register",
            new { name = "Beto", email, password = "una-clave-larga" });

        await merchant.PutAsync("/api/v1/email-templates/cambio-contrasena", new
        {
            enabled = false,
            subject = "Tu clave de {{store}}",
            bodyHtml = "<p>Hola {{name}}, escribinos si no fuiste vos.</p>",
        });

        Assert.Equal(HttpStatusCode.NoContent,
            (await shopper.SendAsync(HttpMethod.Post, "/api/v1/shop/auth/forgot", new { email })).StatusCode);
        var mail = await factory.ExternalHttp.WaitForEmailAsync(email, m => m.Subject.StartsWith("Tu clave", StringComparison.Ordinal));
        Assert.Equal($"Tu clave de Tienda {merchant.Subdomain}", mail.Subject);
        Assert.Contains("Hola Beto, escribinos si no fuiste vos.", mail.Html, StringComparison.Ordinal);
        Assert.Contains("Cambiar contraseña", mail.Html, StringComparison.Ordinal);
        Assert.Contains("O copiá este link", mail.Html, StringComparison.Ordinal);

        await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/shop/auth/reset",
            new { token = TokenFrom(mail.Html), password = "nueva-clave-larga" });
    }

    private static string TokenFrom(string html) => TokenRegex().Match(html).Groups[1].Value;

    [GeneratedRegex(@"token=([A-Za-z0-9_\-%]+)")]
    private static partial Regex TokenRegex();
}
