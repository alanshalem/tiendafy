using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Web;
using Api.Notifications;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Notifications.Infrastructure;

namespace IntegrationTests;

/// <summary>
/// Email marketing de punta a punta, con Resend simulado en
/// <see cref="FakeHttp"/>: armar la audiencia → enviar → el worker manda los
/// mails → el destinatario abre, hace click y se da de baja → Resend avisa un
/// rebote.
///
/// <para>
/// Los links de tracking y de baja se sacan del HTML que realmente salió por
/// Resend: si el worker los armara mal, el test los seguiría y fallaría, igual
/// que un destinatario de verdad.
/// </para>
/// </summary>
[Collection("api")]
public sealed partial class CampaignFlowTests
{
    private readonly ApiFactory _factory;

    public CampaignFlowTests(ApiFactory factory) => _factory = factory;

    private static object Campaign(string subject, string audience = "buyers", List<string>? emails = null) => new
    {
        subject,
        bodyHtml = "<h1>Novedades</h1><p>Mirá lo nuevo: <a href=\"https://tienda.example.com/ofertas\">ofertas</a></p>",
        audience,
        emails,
        couponCode = "VUELVE10",
        products = new[] { new { id = Guid.NewGuid(), name = "Remera", priceMinor = 10_000_00L, imageUrl = (string?)null, slug = "remera" } },
    };

    [Fact]
    public async Task Armar_enviar_abrir_clickear_darse_de_baja_y_rebotar()
    {
        var merchant = await Merchant.CreateAsync(_factory, "cmp");
        var ana = $"ana-{merchant.Subdomain}@mail.com";
        var beto = $"beto-{merchant.Subdomain}@mail.com";
        await merchant.CreateSaleAsync(priceMinor: 30_000_00, buyerEmail: ana);
        await merchant.CreateSaleAsync(priceMinor: 5_000_00, buyerEmail: beto);

        // Audiencia: compradores, filtrada por lo que gastaron.
        var all = await merchant.PostAsync("/api/v1/admin/campaigns/audience/preview", new { type = "buyers" });
        Assert.Equal(2, all.GetProperty("count").GetInt32());
        var big = await merchant.PostAsync("/api/v1/admin/campaigns/audience/preview",
            new { type = "buyers", minSpentMinor = 10_000_00L, minOrders = 1, purchasedWithinDays = 30 });
        Assert.Equal(ana, Assert.Single(big.GetProperty("sample").EnumerateArray()).GetProperty("email").GetString());
        var inactive = await merchant.PostAsync("/api/v1/admin/campaigns/audience/preview", new { type = "buyers", inactiveForDays = 30 });
        Assert.Equal(0, inactive.GetProperty("count").GetInt32());

        // Validaciones del borrador.
        Assert.Equal(HttpStatusCode.BadRequest,
            (await merchant.SendAsync(HttpMethod.Post, "/api/v1/admin/campaigns", new { subject = "", bodyHtml = "x" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await merchant.SendAsync(HttpMethod.Post, "/api/v1/admin/campaigns", new { subject = "x", bodyHtml = "" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await merchant.SendAsync(HttpMethod.Post, "/api/v1/admin/campaigns", new { subject = "x", bodyHtml = "x", audience = "custom" })).StatusCode);

        // Borrador, edición y vista previa con el layout de la tienda.
        var created = await merchant.PostAsync("/api/v1/admin/campaigns", Campaign("Novedades de octubre"));
        var id = created.GetProperty("id").GetGuid();
        var edited = await merchant.PutAsync($"/api/v1/admin/campaigns/{id}", Campaign("Novedades de octubre ✨"));
        Assert.Equal("Novedades de octubre ✨", edited.GetProperty("subject").GetString());
        var preview = await merchant.PostAsync("/api/v1/admin/campaigns/preview", Campaign("Vista previa"));
        Assert.Contains("Remera", preview.GetProperty("html").GetString());

        // Prueba a una casilla propia: lleva [PRUEBA] y un link de baja real.
        Assert.Equal(HttpStatusCode.BadRequest,
            (await merchant.SendAsync(HttpMethod.Post, $"/api/v1/admin/campaigns/{id}/test", new { email = "no-es-un-mail" })).StatusCode);
        var me = $"yo-{merchant.Subdomain}@tienda.com";
        await merchant.PostAsync($"/api/v1/admin/campaigns/{id}/test", new { email = me });
        Assert.StartsWith("[PRUEBA]", Assert.Single(_factory.ExternalHttp.EmailsTo(me)).Subject);

        // Enviar: la audiencia se congela y el worker manda.
        var sending = await merchant.PostAsync($"/api/v1/admin/campaigns/{id}/send", new { });
        Assert.Equal(2, sending.GetProperty("recipientCount").GetInt32());
        Assert.Equal(HttpStatusCode.Conflict,
            (await merchant.SendAsync(HttpMethod.Put, $"/api/v1/admin/campaigns/{id}", Campaign("tarde"))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await merchant.SendAsync(HttpMethod.Delete, $"/api/v1/admin/campaigns/{id}")).StatusCode);

        await RunUntilAsync(id, "sent");
        // Ana también recibió la confirmación de su compra: se busca la campaña.
        var mail = Assert.Single(_factory.ExternalHttp.EmailsTo(ana), m => m.Subject.StartsWith("Novedades"));

        // El uso del mes cuenta la campaña aparte de los avisos automáticos
        // (antes decía "0 enviados" con la campaña recién salida).
        var usage = (await merchant.GetAsync("/api/v1/notifications/usage")).GetProperty("email");
        Assert.True(usage.GetProperty("campaignsMonth").GetInt32() >= 1);
        Assert.Equal(usage.GetProperty("campaignsMonth").GetInt32(), usage.GetProperty("campaignsTotal").GetInt32());
        Assert.Equal(merchant.TenantId.ToString(), mail.TenantTag); // para atribuir rebotes

        // Abre (pixel), hace click (redirect al destino) y se da de baja.
        var anonymous = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var pixel = await anonymous.GetAsync(Link(mail.Html, "/api/v1/marketing/o.gif"));
        Assert.Equal("image/gif", pixel.Content.Headers.ContentType?.MediaType);
        var clickLink = Link(mail.Html, "/api/v1/marketing/c");
        var click = await anonymous.GetAsync(clickLink);
        Assert.Equal(HttpStatusCode.Redirect, click.StatusCode);
        Assert.Equal("https://tienda.example.com/ofertas", click.Headers.Location?.ToString());
        Assert.Equal(HttpStatusCode.BadRequest, (await anonymous.GetAsync("/api/v1/marketing/c?u=javascript:alert(1)")).StatusCode);

        // No es un redirector abierto: sin un token de campaña válido no lleva
        // a ningún lado, y con uno lleva solo a los links que la campaña tiene
        // (o a la tienda). Cambiar el destino del link manda a la tienda.
        var t = HttpUtility.ParseQueryString(new Uri("http://x" + clickLink).Query)["t"]!;
        const string phishing = "https://evil.example/login";
        Assert.Equal(HttpStatusCode.BadRequest,
            (await anonymous.GetAsync($"/api/v1/marketing/c?u={Uri.EscapeDataString(phishing)}")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await anonymous.GetAsync($"/api/v1/marketing/c?t=trucho&u={Uri.EscapeDataString(phishing)}")).StatusCode);
        var tampered = await anonymous.GetAsync(
            $"/api/v1/marketing/c?t={Uri.EscapeDataString(t)}&u={Uri.EscapeDataString(phishing)}");
        Assert.Equal(HttpStatusCode.Redirect, tampered.StatusCode);
        Assert.Equal($"{merchant.Subdomain}.localhost", tampered.Headers.Location?.Host);
        // La card de producto (y cualquier página de la tienda) sí.
        var card = $"http://{merchant.Subdomain}.localhost/productos/remera";
        var toCard = await anonymous.GetAsync($"/api/v1/marketing/c?t={Uri.EscapeDataString(t)}&u={Uri.EscapeDataString(card)}");
        Assert.Equal(card, toCard.Headers.Location?.ToString());

        var unsubscribe = Link(mail.Html, "/api/v1/marketing/unsubscribe");
        Assert.Contains("Sí, darme de baja", await anonymous.GetStringAsync(unsubscribe));
        Assert.Contains("No vas a recibir", await (await anonymous.PostAsync(unsubscribe, null)).Content.ReadAsStringAsync());
        await anonymous.PostAsync(unsubscribe, null); // dos veces no duplica
        Assert.Contains("no es válido", await anonymous.GetStringAsync("/api/v1/marketing/unsubscribe?token=trucho"));
        Assert.Contains("no es válido", await (await anonymous.PostAsync("/api/v1/marketing/unsubscribe", null)).Content.ReadAsStringAsync());

        var detail = await merchant.GetAsync($"/api/v1/admin/campaigns/{id}");
        var stats = detail.GetProperty("stats");
        Assert.Equal(2, stats.GetProperty("sent").GetInt32());
        Assert.Equal(1, stats.GetProperty("opened").GetInt32());
        Assert.Equal(1, stats.GetProperty("clicked").GetInt32());
        Assert.Equal(1, stats.GetProperty("unsubs").GetInt32());
        Assert.Equal("VUELVE10", detail.GetProperty("attribution").GetProperty("couponCode").GetString());

        // Ana se dio de baja: la próxima campaña no le llega.
        var again = await merchant.PostAsync("/api/v1/admin/campaigns/audience/preview", new { type = "buyers" });
        Assert.Equal(1, again.GetProperty("count").GetInt32());

        // Resend avisa que el mail de Beto rebotó: también queda suprimido.
        Assert.Equal(HttpStatusCode.Unauthorized, (await ResendWebhookAsync(new { type = "email.bounced" }, sign: false)).StatusCode);
        var bounce = new
        {
            type = "email.bounced",
            data = new { to = new[] { beto.ToUpperInvariant() }, tags = new[] { new { name = "tenant", value = merchant.TenantId.ToString() } } },
        };
        // Bien firmado pero de hace 10 minutos: un reenvío de un aviso capturado.
        // Se rechaza y no suprime a nadie (Beto sigue en la audiencia).
        Assert.Equal(HttpStatusCode.BadRequest, (await ResendWebhookAsync(bounce, age: TimeSpan.FromMinutes(10))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await ResendWebhookAsync(bounce, age: TimeSpan.FromMinutes(-10))).StatusCode);
        Assert.Equal(1, (await merchant.PostAsync("/api/v1/admin/campaigns/audience/preview", new { type = "buyers" })).GetProperty("count").GetInt32());
        Assert.Equal(HttpStatusCode.OK, (await ResendWebhookAsync(bounce)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await ResendWebhookAsync(new { type = "email.delivered", data = new { } })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await ResendWebhookAsync(new { type = "email.complained", data = new { to = "x@y.com" } })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await ResendWebhookAsync(new { type = "email.bounced" })).StatusCode); // sin data: no reintentar
        Assert.Equal(0, (await merchant.PostAsync("/api/v1/admin/campaigns/audience/preview", new { type = "buyers" })).GetProperty("count").GetInt32());

        // Duplicar para la próxima.
        var copy = await merchant.PostAsync($"/api/v1/admin/campaigns/{id}/duplicate", new { });
        Assert.EndsWith("(copia)", copy.GetProperty("subject").GetString());
        var list = await merchant.GetAsync("/api/v1/admin/campaigns?limit=10");
        Assert.Equal(2, list.GetProperty("total").GetInt32());
    }

    [Fact]
    public async Task Programar_cancelar_y_audiencias_especiales()
    {
        var merchant = await Merchant.CreateAsync(_factory, "cms");
        var shopper = new Shopper(merchant);
        var subscriber = $"news-{merchant.Subdomain}@mail.com";
        await shopper.SubscribeConfirmedAsync(subscriber);

        // Programar: tiene que ser en el futuro.
        var draft = await merchant.PostAsync("/api/v1/admin/campaigns", Campaign("Programada", audience: "subscribers"));
        var id = draft.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post,
            $"/api/v1/admin/campaigns/{id}/send", new { scheduleAtUtc = DateTime.UtcNow })).StatusCode);
        var scheduled = await merchant.PostAsync($"/api/v1/admin/campaigns/{id}/send", new { scheduleAtUtc = DateTime.UtcNow.AddDays(1) });
        Assert.Equal("scheduled", scheduled.GetProperty("status").GetString());

        // Llega la hora: el worker la arranca y la manda.
        await BackdateScheduleAsync(id);
        await RunUntilAsync(id, "sent");
        Assert.Single(_factory.ExternalHttp.EmailsTo(subscriber), m => !m.Html.Contains("/suscripcion/confirmar", StringComparison.Ordinal));

        // Una programada que llega a la hora sin nadie a quien mandarle se cancela sola.
        var empty = await merchant.PostAsync("/api/v1/admin/campaigns", Campaign("Vacía", audience: "custom", emails: ["nadie@x.com"]));
        var emptyId = empty.GetProperty("id").GetGuid();
        await merchant.PutAsync($"/api/v1/admin/campaigns/{emptyId}", new
        {
            subject = "Vacía",
            bodyHtml = "<p>x</p>",
            audience = "buyers",
        });
        await merchant.PostAsync($"/api/v1/admin/campaigns/{emptyId}/send", new { scheduleAtUtc = DateTime.UtcNow.AddDays(1) });
        await BackdateScheduleAsync(emptyId);
        await RunUntilAsync(emptyId, "cancelled");

        // Envío inmediato a una audiencia vacía: no se puede.
        var none = await merchant.PostAsync("/api/v1/admin/campaigns", new { subject = "Nadie", bodyHtml = "<p>x</p>", audience = "buyers" });
        Assert.Equal(HttpStatusCode.BadRequest,
            (await merchant.SendAsync(HttpMethod.Post, $"/api/v1/admin/campaigns/{none.GetProperty("id").GetGuid()}/send", new { })).StatusCode);

        // Lista a mano: se manda a esos y se puede cancelar a mitad de camino.
        var custom = await merchant.PostAsync("/api/v1/admin/campaigns",
            Campaign("A mano", audience: "custom", emails: [$"uno-{merchant.Subdomain}@x.com", $"dos-{merchant.Subdomain}@x.com"]));
        var customId = custom.GetProperty("id").GetGuid();
        await merchant.PostAsync($"/api/v1/admin/campaigns/{customId}/send", new { });
        var cancelled = await merchant.PostAsync($"/api/v1/admin/campaigns/{customId}/cancel", new { });
        Assert.Equal("cancelled", cancelled.GetProperty("status").GetString());
        Assert.Equal(HttpStatusCode.Conflict,
            (await merchant.SendAsync(HttpMethod.Post, $"/api/v1/admin/campaigns/{customId}/send", new { })).StatusCode);
        await merchant.ExpectOkAsync(HttpMethod.Delete, $"/api/v1/admin/campaigns/{customId}");

        // Lo que no existe.
        var missing = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.NotFound, (await merchant.SendAsync(HttpMethod.Get, $"/api/v1/admin/campaigns/{missing}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await merchant.SendAsync(HttpMethod.Put, $"/api/v1/admin/campaigns/{missing}", Campaign("x"))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await merchant.SendAsync(HttpMethod.Post, $"/api/v1/admin/campaigns/{missing}/send", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await merchant.SendAsync(HttpMethod.Post, $"/api/v1/admin/campaigns/{missing}/cancel")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await merchant.SendAsync(HttpMethod.Post, $"/api/v1/admin/campaigns/{missing}/duplicate")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await merchant.SendAsync(HttpMethod.Post, $"/api/v1/admin/campaigns/{missing}/test", new { email = "a@b.com" })).StatusCode);
        await merchant.ExpectOkAsync(HttpMethod.Delete, $"/api/v1/admin/campaigns/{missing}");
    }

    [Fact]
    public async Task Si_Resend_rechaza_un_email_el_destinatario_cuenta_como_fallido()
    {
        var merchant = await Merchant.CreateAsync(_factory, "cmf");
        var ok = $"llega-{merchant.Subdomain}@mail.com";
        var rejected = $"rebota-{merchant.Subdomain}@mail.com";

        // Resend acepta todo menos esa dirección (422: un error definitivo, sin reintentos).
        _factory.ExternalHttp.On(HttpMethod.Post, ApiFactory.ResendEmails, (_, body) =>
            body!.Contains(rejected, StringComparison.Ordinal)
                ? FakeHttp.Json(new { statusCode = 422, message = "Invalid `to` field." }, HttpStatusCode.UnprocessableEntity)
                : FakeHttp.Json(new { id = "re_test" }));
        try
        {
            var created = await merchant.PostAsync("/api/v1/admin/campaigns",
                Campaign("Con un rechazo", audience: "custom", emails: [ok, rejected]));
            var id = created.GetProperty("id").GetGuid();
            await merchant.PostAsync($"/api/v1/admin/campaigns/{id}/send", new { });
            await RunUntilAsync(id, "sent");

            // Antes EmailSender se tragaba el error y los dos quedaban "enviados".
            var detail = await merchant.GetAsync($"/api/v1/admin/campaigns/{id}");
            var stats = detail.GetProperty("stats");
            Assert.Equal(1, stats.GetProperty("sent").GetInt32());
            Assert.Equal(1, stats.GetProperty("failed").GetInt32());
            Assert.Equal(rejected, Assert.Single(detail.GetProperty("failedEmails").EnumerateArray()).GetString());
            Assert.Single(_factory.ExternalHttp.EmailsTo(ok));
        }
        finally
        {
            _factory.AcceptAllEmails();
        }
    }

    [Fact]
    public async Task Las_cards_de_productos_apuntan_a_la_tienda()
    {
        var merchant = await Merchant.CreateAsync(_factory, "cml");
        var preview = await merchant.PostAsync("/api/v1/admin/campaigns/preview", Campaign("Links"));
        // En los tests la plataforma es localhost: ahí (y solo ahí) va http.
        // En producción la misma cuenta da https (ver StoreLinksTests).
        Assert.Contains($"http://{merchant.Subdomain}.localhost/productos/remera", preview.GetProperty("html").GetString(), StringComparison.Ordinal);
    }

    // ---------------------------------------------------------------- helpers

    /// <summary>
    /// Pasadas del worker hasta que la campaña llegue a ese estado. El worker
    /// toma la campaña en curso más vieja de TODA la base, que persiste entre
    /// corridas: puede tener que despachar otras antes.
    /// </summary>
    private async Task RunUntilAsync(Guid campaignId, string status)
    {
        for (var pass = 0; pass < 30; pass++)
        {
            await Workers.RunOnceAsync<CampaignWorker>(_factory);
            using var scope = _factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<NotificationsDbContext>();
            if (await db.EmailCampaigns.AnyAsync(c => c.Id == campaignId && c.Status == status)) return;
        }
        Assert.Fail($"La campaña {campaignId} no llegó a '{status}'.");
    }

    private async Task BackdateScheduleAsync(Guid campaignId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<NotificationsDbContext>();
        await db.EmailCampaigns.Where(c => c.Id == campaignId)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.ScheduledAtUtc, DateTime.UtcNow.AddMinutes(-1)));
    }

    /// <summary>El primer link del HTML que apunta a ese path, como lo seguiría el destinatario.</summary>
    private static string Link(string html, string path)
    {
        var match = Href().Matches(html).Select(m => HttpUtility.HtmlDecode(m.Groups[1].Value))
            .Concat(Src().Matches(html).Select(m => HttpUtility.HtmlDecode(m.Groups[1].Value)))
            .First(u => u.Contains(path, StringComparison.Ordinal));
        var uri = new Uri(match);
        return uri.PathAndQuery;
    }

    [GeneratedRegex("href=\"([^\"]+)\"")]
    private static partial Regex Href();

    [GeneratedRegex("src=\"([^\"]+)\"")]
    private static partial Regex Src();

    /// <summary>Un aviso de Resend firmado como lo firma svix.</summary>
    private Task<HttpResponseMessage> ResendWebhookAsync(object payload, bool sign = true, TimeSpan? age = null)
    {
        var body = System.Text.Json.JsonSerializer.Serialize(payload, Merchant.Json);
        var id = $"msg_{Guid.NewGuid():N}";
        var ts = (DateTimeOffset.UtcNow - (age ?? TimeSpan.Zero)).ToUnixTimeSeconds().ToString(System.Globalization.CultureInfo.InvariantCulture);
        var key = Convert.FromBase64String(ApiFactory.ResendWebhookSecret["whsec_".Length..]);
        var signature = Convert.ToBase64String(HMACSHA256.HashData(key, Encoding.UTF8.GetBytes($"{id}.{ts}.{body}")));

        var req = new HttpRequestMessage(HttpMethod.Post, "/api/v1/webhooks/resend")
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json"),
        };
        req.Headers.Add("svix-id", id);
        req.Headers.Add("svix-timestamp", ts);
        req.Headers.Add("svix-signature", sign ? $"v1,{signature}" : "v1,firma-falsa");
        return _factory.CreateClient().SendAsync(req);
    }
}
