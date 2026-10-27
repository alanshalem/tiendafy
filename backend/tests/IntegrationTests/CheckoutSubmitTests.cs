using System.Net;
using System.Text.Json;

namespace IntegrationTests;

/// <summary>
/// El envío del checkout (reserva stock) contra lo que manda un navegador
/// apurado o uno malintencionado: envíos simultáneos de la misma compra y
/// emails que no entran en la columna.
/// </summary>
[Collection("api")]
public sealed class CheckoutSubmitTests(ApiFactory factory)
{
    private static async Task<int> ReservedAsync(Merchant merchant, Guid variantId) =>
        (await merchant.GetAsync($"/api/v1/inventory?variantIds={variantId}")).GetProperty("items")
            .EnumerateArray().Single().GetProperty("reserved").GetInt32();

    private static object Submit(string email) => new
    {
        email,
        name = "Ana",
        lastName = "Pérez",
        phone = "1155556666",
        docNumber = "30111222",
    };

    [Fact]
    public async Task Envios_simultaneos_de_la_misma_compra_reservan_una_sola_vez()
    {
        var merchant = await Merchant.CreateAsync(factory, "csb");
        var (_, variantId) = await merchant.CreateProductAsync("Mate", priceMinor: 10_000_00, stock: 50);
        var shopper = new Shopper(merchant);
        var session = await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/checkout",
            new { lines = new[] { new { variantId, quantity = 2 } } });
        var id = session.GetProperty("id").GetGuid();

        var responses = await Task.WhenAll(Enumerable.Range(0, 6).Select(_ =>
            shopper.SendAsync(HttpMethod.Post, $"/api/v1/checkout/{id}/submit", Submit("ana@test.local"))));

        Assert.Single(responses, r => r.IsSuccessStatusCode);
        Assert.All(responses.Where(r => !r.IsSuccessStatusCode), r => Assert.Equal(HttpStatusCode.Conflict, r.StatusCode));
        // Solo las 2 unidades de la compra que quedó: ninguna reserva huérfana.
        Assert.Equal(2, await ReservedAsync(merchant, variantId));
    }

    [Theory]
    [InlineData("sin-arroba.com")]
    [InlineData("ana@")]
    [InlineData("@mail.com")]
    [InlineData("ana @mail.com")]
    [InlineData("ana@mail")]
    public async Task Un_email_que_no_es_email_es_un_error_de_validacion(string email)
    {
        var merchant = await Merchant.CreateAsync(factory, "cse");
        var (_, variantId) = await merchant.CreateProductAsync("Termo", priceMinor: 10_000_00, stock: 5);
        var shopper = new Shopper(merchant);
        var id = (await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/checkout",
            new { lines = new[] { new { variantId, quantity = 1 } } })).GetProperty("id").GetGuid();

        var res = await shopper.SendAsync(HttpMethod.Post, $"/api/v1/checkout/{id}/submit", Submit(email));
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Equal("Checkout.InvalidEmail", (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("title").GetString());
        Assert.Equal(0, await ReservedAsync(merchant, variantId));
    }

    /// <summary>
    /// Antes un email de más de 200 caracteres llegaba a la base y daba 500
    /// (la columna es varchar(200)); ahora es un error de validación.
    /// </summary>
    [Fact]
    public async Task Un_email_mas_largo_que_la_columna_es_un_error_de_validacion_y_no_un_500()
    {
        var merchant = await Merchant.CreateAsync(factory, "csl");
        var (_, variantId) = await merchant.CreateProductAsync("Bombilla", priceMinor: 10_000_00, stock: 5);
        var shopper = new Shopper(merchant);
        var id = (await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/checkout",
            new { lines = new[] { new { variantId, quantity = 1 } } })).GetProperty("id").GetGuid();
        var longEmail = new string('a', 195) + "@mail.com";

        var submit = await shopper.SendAsync(HttpMethod.Post, $"/api/v1/checkout/{id}/submit", Submit(longEmail));
        Assert.Equal(HttpStatusCode.BadRequest, submit.StatusCode);

        var contact = await shopper.SendAsync(HttpMethod.Post, "/api/v1/checkout/contact", new
        {
            lines = new[] { new { variantId, quantity = 1 } },
            email = longEmail,
        });
        Assert.Equal(HttpStatusCode.BadRequest, contact.StatusCode);
    }
}
