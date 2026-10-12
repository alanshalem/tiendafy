using System.Net;
using System.Text.Json;

namespace IntegrationTests;

/// <summary>
/// Los e-mails automáticos de la tienda: editar una plantilla (y volver a
/// editarla), lo que se limpia del HTML que escribe el comercio, y la vista
/// previa, que pasa por el mismo camino que el envío real.
/// </summary>
[Collection("api")]
public sealed class EmailTemplateTests(ApiFactory factory)
{
    private const string Type = "carritos-abandonados";

    private static JsonElement Template(JsonElement list, string type) =>
        list.GetProperty("items").EnumerateArray().Single(t => t.GetProperty("type").GetString() == type);

    [Fact]
    public async Task Editar_una_plantilla_dos_veces_y_limpiar_lo_peligroso()
    {
        var merchant = await Merchant.CreateAsync(factory, "etp");
        var original = Template(await merchant.GetAsync("/api/v1/email-templates"), Type);

        // Primera edición: crea el override, sin <script>.
        var first = await merchant.PutAsync($"/api/v1/email-templates/{Type}", new
        {
            enabled = true,
            subject = "  ¿Te olvidaste algo, {{name}}?  ",
            bodyHtml = "<p>Volvé a <b>{{store}}</b></p><script>alert(1)</script>",
        });
        Assert.True(first.GetProperty("enabled").GetBoolean());
        Assert.Equal("¿Te olvidaste algo, {{name}}?", first.GetProperty("subject").GetString());
        Assert.DoesNotContain("<script", first.GetProperty("bodyHtml").GetString(), StringComparison.OrdinalIgnoreCase);

        // Segunda edición sobre el mismo override; vacío vuelve al texto de fábrica.
        var second = await merchant.PutAsync($"/api/v1/email-templates/{Type}", new { enabled = false, subject = "", bodyHtml = "" });
        Assert.False(second.GetProperty("enabled").GetBoolean());
        Assert.Equal(original.GetProperty("subject").GetString(), second.GetProperty("subject").GetString());

        var listed = Template(await merchant.GetAsync("/api/v1/email-templates"), Type);
        Assert.False(listed.GetProperty("enabled").GetBoolean());

        Assert.Equal(HttpStatusCode.NotFound,
            (await merchant.SendAsync(HttpMethod.Put, "/api/v1/email-templates/no-existe", new { enabled = true })).StatusCode);
    }

    [Fact]
    public async Task La_vista_previa_reemplaza_las_variables_y_usa_el_layout_de_la_tienda()
    {
        var merchant = await Merchant.CreateAsync(factory, "etv");
        var preview = await merchant.PostAsync("/api/v1/email-templates/preview", new
        {
            subject = "Tu pedido en {{store}}",
            bodyHtml = "<p>Hola {{name}}, total {{total}}</p>{{items}}<img src=x onerror=alert(1)>",
        });
        Assert.Equal($"Tu pedido en Tienda {merchant.Subdomain}", preview.GetProperty("subject").GetString());
        var html = preview.GetProperty("html").GetString()!;
        Assert.Contains("Hola Juan Pérez, total ARS 45.381", html, StringComparison.Ordinal);
        Assert.Contains("Remera negra", html, StringComparison.Ordinal); // la tabla de ejemplo de {{items}}
        Assert.DoesNotContain("onerror", html, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("<html", html, StringComparison.OrdinalIgnoreCase);

        // Sin asunto ni cuerpo no rompe.
        var empty = await merchant.PostAsync("/api/v1/email-templates/preview", new { });
        Assert.Equal("", empty.GetProperty("subject").GetString());
    }

    [Fact]
    public async Task Los_emails_llevan_el_logo_y_el_color_del_tema_publicado()
    {
        var merchant = await Merchant.CreateAsync(factory, "etb");
        await merchant.ExpectOkAsync(HttpMethod.Post, "/api/v1/theme/publish", new
        {
            logo = "https://cdn.example/logo-tienda.png",
            colors = new { primary = "232 80 30", accent = "0 0 0", useAccent = false, bg = "255 255 255", text = "17 24 39" },
            sections = Array.Empty<object>(),
        });

        var html = (await merchant.PostAsync("/api/v1/email-templates/preview", new { subject = "x", bodyHtml = "<p>x</p>" }))
            .GetProperty("html").GetString()!;
        Assert.Contains("https://cdn.example/logo-tienda.png", html, StringComparison.Ordinal);
        Assert.Contains("#e8501e", html, StringComparison.OrdinalIgnoreCase); // "232 80 30" en hex
    }
}
