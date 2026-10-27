using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.RegularExpressions;
using Api.Notifications;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Orders.Infrastructure.Persistence;

namespace IntegrationTests;

/// <summary>
/// Reseñas de punta a punta: solo opina quien compró (con el link de una venta
/// despachada, del email o de su cuenta), una vez por línea, con fotos de esta
/// tienda; la tienda modera (aprobación automática configurable, ocultar,
/// responder); votos y denuncias cuentan una vez por persona; el pedido por
/// email sale una vez; y nada cruza de una tienda a otra.
/// </summary>
[Collection("api")]
public sealed partial class ReviewsFlowTests(ApiFactory factory)
{
    [Fact]
    public async Task Solo_opina_quien_compro_y_la_tienda_modera()
    {
        var merchant = await Merchant.CreateAsync(factory, "rev");
        var (productId, variantId) = await merchant.CreateProductAsync($"Mate {merchant.Subdomain}");
        var buyerEmail = $"ana-{merchant.Subdomain}@mail.com";
        var orderId = await SaleAsync(merchant, variantId, buyerEmail, "ana maría pérez");

        // Sin link (o con uno inventado) no se escribe nada.
        var anonymous = new Shopper(merchant);
        Assert.Equal(HttpStatusCode.BadRequest, (await anonymous.SendAsync(HttpMethod.Get, "/api/v1/reviews/invite?token=inventado")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await anonymous.SendAsync(HttpMethod.Post, "/api/v1/reviews",
            new { token = "inventado", orderItemId = Guid.NewGuid(), rating = 5, body = "Excelente producto, llegó rápido." })).StatusCode);

        // El comprador logueado ve su venta, pero todavía no se despachó.
        var buyer = new Shopper(merchant);
        await buyer.RegisterVerifiedAsync(buyerEmail, "Ana");
        var notYet = await buyer.ExpectJsonAsync(HttpMethod.Get, $"/api/v1/shop/orders/{orderId}/review-invite");
        Assert.False(notYet.GetProperty("eligible").GetBoolean());

        // Otro comprador no ve la venta ajena.
        var stranger = new Shopper(merchant);
        await stranger.RegisterVerifiedAsync($"otro-{merchant.Subdomain}@mail.com", "Otro");
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.SendAsync(HttpMethod.Get, $"/api/v1/shop/orders/{orderId}/review-invite")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.SendAsync(HttpMethod.Get, $"/api/v1/shop/orders/{orderId}/review-invite")).StatusCode);

        await merchant.PostAsync($"/api/v1/orders/{orderId}/fulfill", new { tracking = "AR-1" });
        var invite = await buyer.ExpectJsonAsync(HttpMethod.Get, $"/api/v1/shop/orders/{orderId}/review-invite");
        Assert.True(invite.GetProperty("eligible").GetBoolean());
        Assert.Equal(1, invite.GetProperty("pending").GetInt32());
        var token = invite.GetProperty("token").GetString()!;

        // La invitación: lo que compró y cómo va a firmar ("Ana P.", nunca el apellido ni el email).
        var lines = await anonymous.ExpectJsonAsync(HttpMethod.Get, $"/api/v1/reviews/invite?token={Uri.EscapeDataString(token)}");
        Assert.Equal("Ana P.", lines.GetProperty("authorName").GetString());
        var line = Assert.Single(lines.GetProperty("items").EnumerateArray());
        Assert.True(line.GetProperty("canReview").GetBoolean());
        var orderItemId = line.GetProperty("orderItemId").GetGuid();

        // Validaciones: estrellas, texto, fotos de otro lado, una línea ajena.
        Assert.Equal(HttpStatusCode.BadRequest, (await anonymous.SendAsync(HttpMethod.Post, "/api/v1/reviews",
            new { token, orderItemId, rating = 0, body = "Excelente producto, llegó rápido." })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await anonymous.SendAsync(HttpMethod.Post, "/api/v1/reviews",
            new { token, orderItemId, rating = 5, body = "Bueno" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await anonymous.SendAsync(HttpMethod.Post, "/api/v1/reviews",
            new { token, orderItemId, rating = 5, body = "Excelente producto, llegó rápido.", photos = new[] { "https://otro-sitio.example/foto.jpg" } })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.SendAsync(HttpMethod.Post, "/api/v1/reviews",
            new { token, orderItemId = Guid.NewGuid(), rating = 5, body = "Excelente producto, llegó rápido." })).StatusCode);

        // La foto se sube con el link (solo imágenes) y la reseña de 5 estrellas
        // se publica sola (de fábrica, 4 y 5 no pasan por moderación).
        var photoUrl = await UploadPhotoAsync(anonymous, token);
        Assert.StartsWith($"{ApiFactory.Storage}/tiendafy-media/{merchant.TenantId}/", photoUrl);
        var created = await anonymous.ExpectJsonAsync(HttpMethod.Post, "/api/v1/reviews", new
        {
            token,
            orderItemId,
            rating = 5,
            title = "Muy bueno",
            body = "Excelente producto, llegó rápido y bien embalado.",
            photos = new[] { photoUrl },
        });
        Assert.Equal("approved", created.GetProperty("status").GetString());
        var reviewId = created.GetProperty("id").GetGuid();

        // Una por línea de venta.
        Assert.Equal(HttpStatusCode.Conflict, (await anonymous.SendAsync(HttpMethod.Post, "/api/v1/reviews",
            new { token, orderItemId, rating = 1, body = "Ahora opino otra cosa distinta." })).StatusCode);

        // Lo que ve la tienda: promedio, distribución, la foto, "compra verificada"; y las estrellas en la card.
        var page = await anonymous.ExpectJsonAsync(HttpMethod.Get, $"/api/v1/reviews/products/{productId}");
        Assert.Equal(1, page.GetProperty("summary").GetProperty("count").GetInt32());
        Assert.Equal(5m, page.GetProperty("summary").GetProperty("average").GetDecimal());
        Assert.Equal(1, page.GetProperty("summary").GetProperty("distribution")[4].GetInt32());
        var shown = Assert.Single(page.GetProperty("items").EnumerateArray());
        Assert.Equal("Ana P.", shown.GetProperty("authorName").GetString());
        Assert.True(shown.GetProperty("verified").GetBoolean());
        Assert.Equal(photoUrl, shown.GetProperty("photos")[0].GetString());
        Assert.False(shown.TryGetProperty("buyerEmail", out _));
        var card = (await anonymous.ExpectJsonAsync(HttpMethod.Get, $"/api/v1/products/search?q={merchant.Subdomain}"))
            .GetProperty("items").EnumerateArray().Single();
        Assert.Equal(1, card.GetProperty("rating").GetProperty("count").GetInt32());

        // Una de 2 estrellas espera moderación: no se ve hasta que la tienda la aprueba.
        var secondOrder = await SaleAsync(merchant, variantId, buyerEmail, "Ana Pérez", fulfill: true);
        var (secondToken, secondItem) = await InviteAsync(buyer, anonymous, secondOrder);
        var low = await anonymous.ExpectJsonAsync(HttpMethod.Post, "/api/v1/reviews",
            new { token = secondToken, orderItemId = secondItem, rating = 2, body = "No era lo que esperaba, el color es otro." });
        Assert.Equal("pending", low.GetProperty("status").GetString());
        var lowId = low.GetProperty("id").GetGuid();
        Assert.Equal(1, (await anonymous.ExpectJsonAsync(HttpMethod.Get, $"/api/v1/reviews/products/{productId}")).GetProperty("summary").GetProperty("count").GetInt32());

        var inbox = await merchant.GetAsync("/api/v1/admin/reviews?status=pending");
        Assert.Equal(lowId, Assert.Single(inbox.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
        Assert.Equal(buyerEmail, inbox.GetProperty("items")[0].GetProperty("buyerEmail").GetString());
        await merchant.PostAsync($"/api/v1/admin/reviews/{lowId}/approve", new { });
        var both = await anonymous.ExpectJsonAsync(HttpMethod.Get, $"/api/v1/reviews/products/{productId}?sort=recent");
        Assert.Equal(2, both.GetProperty("summary").GetProperty("count").GetInt32());
        Assert.Equal(3.5m, both.GetProperty("summary").GetProperty("average").GetDecimal());
        await merchant.PostAsync($"/api/v1/admin/reviews/{lowId}/hide", new { });
        Assert.Equal(1, (await anonymous.ExpectJsonAsync(HttpMethod.Get, $"/api/v1/reviews/products/{productId}")).GetProperty("summary").GetProperty("count").GetInt32());

        // La respuesta pública de la tienda.
        await merchant.PutAsync($"/api/v1/admin/reviews/{reviewId}/reply", new { reply = "¡Gracias, Ana!" });
        Assert.Equal("¡Gracias, Ana!", (await anonymous.ExpectJsonAsync(HttpMethod.Get, $"/api/v1/reviews/products/{productId}"))
            .GetProperty("items")[0].GetProperty("reply").GetString());

        // "Me sirvió": una vez por persona.
        Assert.Equal(1, (await anonymous.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/reviews/{reviewId}/helpful")).GetProperty("helpfulCount").GetInt32());
        Assert.Equal(1, (await anonymous.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/reviews/{reviewId}/helpful")).GetProperty("helpfulCount").GetInt32());

        // Denuncias: la misma persona cuenta una vez; tres distintas la sacan de la tienda.
        for (var i = 0; i < 2; i++) await ReportAsync(merchant, reviewId, "navegador-1");
        await ReportAsync(merchant, reviewId, "navegador-2");
        Assert.Equal(1, (await anonymous.ExpectJsonAsync(HttpMethod.Get, $"/api/v1/reviews/products/{productId}")).GetProperty("summary").GetProperty("count").GetInt32());
        await ReportAsync(merchant, reviewId, "navegador-3");
        Assert.Equal(0, (await anonymous.ExpectJsonAsync(HttpMethod.Get, $"/api/v1/reviews/products/{productId}")).GetProperty("summary").GetProperty("count").GetInt32());
        var flagged = await merchant.GetAsync("/api/v1/admin/reviews?status=pending");
        Assert.Equal(1, flagged.GetProperty("counts").GetProperty("flagged").GetInt32());
        Assert.True(flagged.GetProperty("items")[0].GetProperty("flagged").GetBoolean());
        await merchant.PostAsync($"/api/v1/admin/reviews/{reviewId}/approve", new { });

        // Configuración: sin aprobación automática, hasta las de 5 esperan; y con
        // la tienda sin reseñas, no hay estrellas en ningún lado.
        var settings = await merchant.PutAsync("/api/v1/admin/reviews/settings",
            new { autoApproveMinRating = (int?)null, requestDelayDays = 10, showOnStore = true, requestEmailEnabled = false });
        Assert.Equal(JsonValueKind.Null, settings.GetProperty("autoApproveMinRating").ValueKind);
        Assert.False(settings.GetProperty("requestEmailEnabled").GetBoolean());
        var thirdOrder = await SaleAsync(merchant, variantId, buyerEmail, "Ana Pérez", fulfill: true);
        var (thirdToken, thirdItem) = await InviteAsync(buyer, anonymous, thirdOrder);
        Assert.Equal("pending", (await anonymous.ExpectJsonAsync(HttpMethod.Post, "/api/v1/reviews",
            new { token = thirdToken, orderItemId = thirdItem, rating = 5, body = "Lo volví a comprar, sigue igual de bueno." })).GetProperty("status").GetString());
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Put, "/api/v1/admin/reviews/settings",
            new { autoApproveMinRating = 4, requestDelayDays = 0, showOnStore = true })).StatusCode);

        await merchant.PutAsync("/api/v1/admin/reviews/settings", new { autoApproveMinRating = 4, requestDelayDays = 7, showOnStore = false });
        Assert.False((await anonymous.ExpectJsonAsync(HttpMethod.Get, $"/api/v1/reviews/products/{productId}")).GetProperty("enabled").GetBoolean());
        var hiddenCard = (await anonymous.ExpectJsonAsync(HttpMethod.Get, $"/api/v1/products/search?q={merchant.Subdomain}"))
            .GetProperty("items").EnumerateArray().Single();
        Assert.Equal(JsonValueKind.Null, hiddenCard.GetProperty("rating").ValueKind);
    }

    [Fact]
    public async Task Las_resenas_de_una_tienda_no_se_ven_ni_se_moderan_desde_otra()
    {
        var a = await Merchant.CreateAsync(factory, "reva");
        var b = await Merchant.CreateAsync(factory, "revb");
        var (productA, variantA) = await a.CreateProductAsync($"Termo {a.Subdomain}");
        var buyerEmail = $"juan-{a.Subdomain}@mail.com";
        var orderId = await SaleAsync(a, variantA, buyerEmail, "Juan Gómez", fulfill: true);
        var buyer = new Shopper(a);
        await buyer.RegisterVerifiedAsync(buyerEmail, "Juan");
        var (token, item) = await InviteAsync(buyer, new Shopper(a), orderId);
        var review = await new Shopper(a).ExpectJsonAsync(HttpMethod.Post, "/api/v1/reviews",
            new { token, orderItemId = item, rating = 4, body = "Mantiene el agua caliente todo el día." });
        var reviewId = review.GetProperty("id").GetGuid();

        // Desde la tienda B: ni la lista pública, ni el panel, ni moderarla, ni usar el link de A.
        var fromB = new Shopper(b);
        Assert.Equal(0, (await fromB.ExpectJsonAsync(HttpMethod.Get, $"/api/v1/reviews/products/{productA}")).GetProperty("summary").GetProperty("count").GetInt32());
        Assert.Equal(HttpStatusCode.BadRequest, (await fromB.SendAsync(HttpMethod.Get, $"/api/v1/reviews/invite?token={Uri.EscapeDataString(token)}")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await fromB.SendAsync(HttpMethod.Post, "/api/v1/reviews",
            new { token, orderItemId = item, rating = 5, body = "Intento cruzar de tienda con el link." })).StatusCode);
        Assert.Equal(0, (await b.GetAsync("/api/v1/admin/reviews?status=all")).GetProperty("total").GetInt32());
        Assert.Equal(HttpStatusCode.NotFound, (await b.SendAsync(HttpMethod.Post, $"/api/v1/admin/reviews/{reviewId}/hide", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await fromB.SendAsync(HttpMethod.Post, $"/api/v1/reviews/{reviewId}/helpful")).StatusCode);
        // La sesión del dueño de A con el header de B no modera las de A.
        Assert.Equal(HttpStatusCode.Forbidden, (await b.SendAsync(a.Client, HttpMethod.Post, $"/api/v1/admin/reviews/{reviewId}/hide", new { })).StatusCode);

        // Permisos: soporte modera; catálogo no.
        var soporte = await a.AddTeammateAsync("soporte", "sop");
        Assert.Equal(HttpStatusCode.OK, await soporte.StatusAsync(HttpMethod.Get, "/api/v1/admin/reviews"));
        var catalogo = await a.AddTeammateAsync("catalogo", "cat");
        Assert.Equal(HttpStatusCode.Forbidden, await catalogo.StatusAsync(HttpMethod.Post, $"/api/v1/admin/reviews/{reviewId}/hide", new { }));
    }

    [Fact]
    public async Task El_pedido_de_resena_sale_una_vez_dias_despues_del_despacho()
    {
        var merchant = await Merchant.CreateAsync(factory, "rvq");
        var (_, variantId) = await merchant.CreateProductAsync($"Bombilla {merchant.Subdomain}");
        var due = $"due-{merchant.Subdomain}@mail.com";
        var early = $"early-{merchant.Subdomain}@mail.com";
        var dueOrder = await SaleAsync(merchant, variantId, due, "Lucía Díaz", fulfill: true);
        await SaleAsync(merchant, variantId, early, "Pedro Ruiz", fulfill: true);
        await FulfilledDaysAgoAsync(dueOrder, 7.2);

        await Workers.RunOnceAsync<ReviewRequestWorker>(factory);
        var mail = Assert.Single(ReviewRequests(due));
        Assert.Contains("/resenas/escribir?t=", mail.Html);
        Assert.Contains("/api/v1/marketing/unsubscribe?token=", mail.Html);
        Assert.Empty(ReviewRequests(early)); // despachado hoy: todavía no

        // El link del email abre la invitación de esa venta.
        var token = Uri.UnescapeDataString(InviteLink().Match(mail.Html).Groups[1].Value);
        var invite = await new Shopper(merchant).ExpectJsonAsync(HttpMethod.Get, $"/api/v1/reviews/invite?token={Uri.EscapeDataString(token)}");
        Assert.Equal("Lucía D.", invite.GetProperty("authorName").GetString());

        // Una sola vez.
        await Workers.RunOnceAsync<ReviewRequestWorker>(factory);
        Assert.Single(ReviewRequests(due));

        // Con el pedido apagado desde Reseñas, no sale.
        var off = $"off-{merchant.Subdomain}@mail.com";
        var offOrder = await SaleAsync(merchant, variantId, off, "Sol Paz", fulfill: true);
        await FulfilledDaysAgoAsync(offOrder, 7.2);
        await merchant.PutAsync("/api/v1/admin/reviews/settings", new { autoApproveMinRating = 4, requestDelayDays = 7, showOnStore = true, requestEmailEnabled = false });
        await Workers.RunOnceAsync<ReviewRequestWorker>(factory);
        Assert.Empty(ReviewRequests(off));
    }

    // ------------------------------------------------------------ helpers

    /// <summary>Los pedidos de reseña que le llegaron (no la confirmación ni el despacho).</summary>
    private List<FakeHttp.Email> ReviewRequests(string to) =>
        [.. factory.ExternalHttp.EmailsTo(to).Where(m => m.Subject.StartsWith("¿Qué te pareció", StringComparison.Ordinal))];

    /// <summary>Una venta de mostrador de esa variante, opcionalmente ya despachada.</summary>
    private static async Task<Guid> SaleAsync(Merchant merchant, Guid variantId, string buyerEmail, string buyerName, bool fulfill = false)
    {
        var order = await merchant.PostAsync("/api/v1/orders/manual", new
        {
            items = new[] { new { variantId, quantity = 1 } },
            paymentMethod = "cash",
            buyerEmail,
            buyerName,
        });
        var id = order.GetProperty("id").GetGuid();
        if (fulfill) await merchant.PostAsync($"/api/v1/orders/{id}/fulfill", new { tracking = "AR-T" });
        return id;
    }

    private static async Task<(string Token, Guid OrderItemId)> InviteAsync(Shopper buyer, Shopper anyone, Guid orderId)
    {
        var token = (await buyer.ExpectJsonAsync(HttpMethod.Get, $"/api/v1/shop/orders/{orderId}/review-invite"))
            .GetProperty("token").GetString()!;
        var item = (await anyone.ExpectJsonAsync(HttpMethod.Get, $"/api/v1/reviews/invite?token={Uri.EscapeDataString(token)}"))
            .GetProperty("items")[0].GetProperty("orderItemId").GetGuid();
        return (token, item);
    }

    private static async Task<string> UploadPhotoAsync(Shopper shopper, string token)
    {
        using var form = new MultipartFormDataContent
        {
            { new StringContent(token), "token" },
            { new ByteArrayContent(TestImages.Png) { Headers = { ContentType = new MediaTypeHeaderValue("image/png") } }, "file", "foto.png" },
        };
        var res = await shopper.SendAsync(HttpMethod.Post, "/api/v1/reviews/photos", form);
        Assert.True(res.IsSuccessStatusCode, await res.Content.ReadAsStringAsync());
        return (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("url").GetString()!;
    }

    /// <summary>Una denuncia desde "otra persona" (otro navegador, misma IP de test).</summary>
    private static async Task ReportAsync(Merchant merchant, Guid reviewId, string userAgent)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/reviews/{reviewId}/report")
        {
            Content = JsonContent.Create(new { reason = "Es falsa" }),
        };
        req.Headers.Add("X-Tenant-Id", merchant.TenantId.ToString());
        req.Headers.UserAgent.ParseAdd(userAgent);
        var res = await merchant.Anonymous().SendAsync(req);
        Assert.Equal(HttpStatusCode.NoContent, res.StatusCode);
    }

    /// <summary>Corre el despacho para atrás: el worker mira cuántos días pasaron.</summary>
    private async Task FulfilledDaysAgoAsync(Guid orderId, double days)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<OrdersDbContext>();
        var when = DateTime.UtcNow.AddDays(-days);
        await db.Orders.IgnoreQueryFilters().Where(o => o.Id == orderId)
            .ExecuteUpdateAsync(u => u.SetProperty(o => o.FulfilledAtUtc, when));
    }

    [GeneratedRegex("/resenas/escribir\\?t=([^\"'&]+)")]
    private static partial Regex InviteLink();
}
