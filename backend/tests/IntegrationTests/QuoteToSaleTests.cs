using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Identity.Infrastructure;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing.Handlers;
using Microsoft.Extensions.DependencyInjection;

namespace IntegrationTests;

/// <summary>
/// El camino completo de una venta mayorista contra la API real: lista de
/// precios → presupuesto al precio de esa lista → aceptarlo en cuenta corriente
/// → la deuda del cliente.
///
/// Son cuatro features que se construyeron por separado y solo sirven si
/// encajan. Cada una tiene sus tests propios; este prueba que la costura
/// aguanta, que es donde se rompen las cosas.
/// </summary>
[Collection("api")]
public sealed class QuoteToSaleTests
{
    private readonly ApiFactory _factory;

    public QuoteToSaleTests(ApiFactory factory) => _factory = factory;

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    [Fact]
    public async Task De_la_lista_mayorista_al_presupuesto_y_de_ahi_a_la_cuenta_corriente()
    {
        var client = _factory.CreateDefaultClient(new CookieContainerHandler());
        var tag = $"quo{Guid.NewGuid():N}"[..12];
        var tenantId = await RegisterWithStoreAsync(client, tag);

        // Un producto de $100.000.
        var variantId = await CreateProductAsync(client, tenantId, "Mancuerna 10kg", 100_000_00);

        // Lista mayorista: 30% menos.
        var list = await PostAsync(client, tenantId, "/api/v1/price-lists",
            new { name = "Mayorista", currency = "ARS", adjustmentPercent = -30, rounding = "none" });
        var listId = list.GetProperty("id").GetGuid();

        // Un cliente con esa lista asignada.
        var customer = await PostAsync(client, tenantId, "/api/v1/customers",
            new { name = "Gimnasio del Centro", email = $"{tag}@gym.test", priceListId = listId });
        var customerId = customer.GetProperty("id").GetGuid();

        // El precio que le toca sale de la lista, no del producto.
        var prices = await GetAsync(client, tenantId,
            $"/api/v1/quotes/prices?customerId={customerId}&variantIds={variantId}");
        Assert.Equal(listId, prices.GetProperty("priceListApplied").GetGuid());
        var unitPrice = prices.GetProperty("items").EnumerateArray().Single().GetProperty("priceMinor").GetInt64();
        Assert.Equal(70_000_00, unitPrice);

        // Presupuesto por 5 unidades a ese precio.
        var quote = await PostAsync(client, tenantId, "/api/v1/quotes",
            new
            {
                customerName = "Gimnasio del Centro",
                customerId,
                customerEmail = $"{tag}@gym.test",
                currency = "ARS",
                validUntilUtc = DateTime.UtcNow.Date.AddDays(15),
                items = new[] { new { variantId, quantity = 5, unitPriceMinor = unitPrice } },
            });
        var quoteId = quote.GetProperty("id").GetGuid();
        Assert.Equal("PRE-0001", quote.GetProperty("number").GetString());
        Assert.Equal(350_000_00, quote.GetProperty("totalMinor").GetInt64());
        Assert.Equal("draft", quote.GetProperty("status").GetString());

        await PostAsync(client, tenantId, $"/api/v1/quotes/{quoteId}/send", new { });

        // Antes de aceptarlo no hay ninguna deuda.
        var balances = await GetAsync(client, tenantId, "/api/v1/finance/balances?partyKind=customer");
        Assert.Empty(balances.GetProperty("items").EnumerateArray());

        // Lo acepta: nace la venta, en cuenta corriente.
        var accepted = await PostAsync(client, tenantId, $"/api/v1/quotes/{quoteId}/accept",
            new { paymentMethod = "cuenta_corriente" });
        var orderId = accepted.GetProperty("orderId").GetGuid();
        Assert.Equal("accepted", accepted.GetProperty("quote").GetProperty("status").GetString());
        Assert.Equal(orderId, accepted.GetProperty("quote").GetProperty("convertedOrderId").GetGuid());

        // La venta quedó al precio del presupuesto, no al del producto.
        var order = await GetAsync(client, tenantId, $"/api/v1/orders/{orderId}");
        Assert.Equal(350_000_00, order.GetProperty("total").GetProperty("amount").GetInt64());

        // Y el cliente nos debe exactamente eso.
        var ledger = await GetAsync(client, tenantId,
            $"/api/v1/finance/ledger?partyKind=customer&partyId={customerId}");
        Assert.Equal(350_000_00, ledger.GetProperty("balanceMinor").GetInt64());
        Assert.Equal("Gimnasio del Centro", ledger.GetProperty("partyName").GetString());

        // Aceptarlo dos veces no duplica la venta ni la deuda.
        var again = await RawPostAsync(client, tenantId, $"/api/v1/quotes/{quoteId}/accept",
            new { paymentMethod = "cuenta_corriente" });
        Assert.Equal(HttpStatusCode.BadRequest, again.StatusCode);

        ledger = await GetAsync(client, tenantId, $"/api/v1/finance/ledger?partyKind=customer&partyId={customerId}");
        Assert.Equal(350_000_00, ledger.GetProperty("balanceMinor").GetInt64());
    }

    [Fact]
    public async Task Un_presupuesto_sin_cliente_no_se_puede_cerrar_en_cuenta_corriente()
    {
        var client = _factory.CreateDefaultClient(new CookieContainerHandler());
        var tag = $"qnc{Guid.NewGuid():N}"[..12];
        var tenantId = await RegisterWithStoreAsync(client, tag);
        var variantId = await CreateProductAsync(client, tenantId, "Barra olímpica", 200_000_00);

        // Se cotiza a nombre de alguien que todavía no está en la agenda: vale,
        // porque a un cliente nuevo se le cotiza antes de darlo de alta.
        var quote = await PostAsync(client, tenantId, "/api/v1/quotes",
            new
            {
                customerName = "Cliente nuevo",
                currency = "ARS",
                validUntilUtc = DateTime.UtcNow.Date.AddDays(10),
                items = new[] { new { variantId, quantity = 1, unitPriceMinor = 200_000_00L } },
            });
        var quoteId = quote.GetProperty("id").GetGuid();

        // Pero fiarle sin ficha dejaría una deuda sin deudor.
        var res = await RawPostAsync(client, tenantId, $"/api/v1/quotes/{quoteId}/accept",
            new { paymentMethod = "cuenta_corriente" });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);

        // En efectivo sí se cierra.
        var ok = await PostAsync(client, tenantId, $"/api/v1/quotes/{quoteId}/accept", new { paymentMethod = "cash" });
        Assert.Equal("accepted", ok.GetProperty("quote").GetProperty("status").GetString());
    }

    [Fact]
    public async Task Un_presupuesto_rechazado_se_reabre_antes_de_volver_a_ofrecerlo()
    {
        var client = _factory.CreateDefaultClient(new CookieContainerHandler());
        var tag = $"qrj{Guid.NewGuid():N}"[..12];
        var tenantId = await RegisterWithStoreAsync(client, tag);
        var variantId = await CreateProductAsync(client, tenantId, "Disco 20kg", 80_000_00);

        var quote = await PostAsync(client, tenantId, "/api/v1/quotes",
            new
            {
                customerName = "Cliente indeciso",
                currency = "ARS",
                validUntilUtc = DateTime.UtcNow.Date.AddDays(10),
                items = new[] { new { variantId, quantity = 2, unitPriceMinor = 80_000_00L } },
            });
        var quoteId = quote.GetProperty("id").GetGuid();

        await PostAsync(client, tenantId, $"/api/v1/quotes/{quoteId}/reject",
            new { reason = "Consiguieron mejor precio" });

        var rejected = await GetAsync(client, tenantId, $"/api/v1/quotes/{quoteId}");
        Assert.Equal("rejected", rejected.GetProperty("status").GetString());
        Assert.False(rejected.GetProperty("editable").GetBoolean());

        var blocked = await RawPostAsync(client, tenantId, $"/api/v1/quotes/{quoteId}/accept", new { paymentMethod = "cash" });
        Assert.Equal(HttpStatusCode.BadRequest, blocked.StatusCode);

        await PostAsync(client, tenantId, $"/api/v1/quotes/{quoteId}/reopen", new { });
        var reopened = await GetAsync(client, tenantId, $"/api/v1/quotes/{quoteId}");
        Assert.Equal("draft", reopened.GetProperty("status").GetString());
        Assert.Null(reopened.GetProperty("rejectionReason").GetString());

        // El resumen cuenta la conversión sobre los decididos, no sobre el total.
        var summary = await GetAsync(client, tenantId, "/api/v1/quotes/summary");
        Assert.Equal(1, summary.GetProperty("total").GetInt32());
        Assert.Equal(1, summary.GetProperty("open").GetInt32());
        Assert.Equal(0, summary.GetProperty("accepted").GetInt32());
    }

    // ---- helpers -------------------------------------------------------------

    private static async Task<HttpResponseMessage> RawPostAsync(HttpClient client, Guid tenantId, string path, object body)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, path) { Content = JsonContent.Create(body) };
        req.Headers.Add("X-Tenant-Id", tenantId.ToString());
        return await client.SendAsync(req);
    }

    private static async Task<JsonElement> PostAsync(HttpClient client, Guid tenantId, string path, object body)
    {
        var res = await RawPostAsync(client, tenantId, path, body);
        Assert.True(res.IsSuccessStatusCode, $"POST {path} → {res.StatusCode}: {await res.Content.ReadAsStringAsync()}");
        return await res.Content.ReadFromJsonAsync<JsonElement>(Json);
    }

    private static async Task<JsonElement> GetAsync(HttpClient client, Guid tenantId, string path)
    {
        var req = new HttpRequestMessage(HttpMethod.Get, path);
        req.Headers.Add("X-Tenant-Id", tenantId.ToString());
        var res = await client.SendAsync(req);
        Assert.True(res.IsSuccessStatusCode, $"GET {path} → {res.StatusCode}: {await res.Content.ReadAsStringAsync()}");
        return await res.Content.ReadFromJsonAsync<JsonElement>(Json);
    }

    private static async Task<Guid> CreateProductAsync(HttpClient client, Guid tenantId, string name, long priceMinor)
    {
        var body = await PostAsync(client, tenantId, "/api/v1/products", new
        {
            name,
            description = "producto de test",
            publish = true,
            variants = new[]
            {
                new { sku = $"SKU-{Guid.NewGuid():N}", optionValues = Array.Empty<string>(), priceAmount = priceMinor, currency = "ARS" },
            },
        });

        var productId = body.GetProperty("id").GetGuid();
        var product = await GetAsync(client, tenantId, $"/api/v1/products/{productId}");
        var variantId = product.GetProperty("variants").EnumerateArray().First().GetProperty("id").GetGuid();

        // Un producto recién creado no tiene stock, y aceptar un presupuesto
        // reserva de verdad: sin esto los tests fallarían por "sin stock", que
        // no es lo que están probando.
        var stock = new HttpRequestMessage(HttpMethod.Put, $"/api/v1/inventory/{variantId}")
        {
            Content = JsonContent.Create(new { available = 100, reason = "carga inicial de test" }),
        };
        stock.Headers.Add("X-Tenant-Id", tenantId.ToString());
        var stockRes = await client.SendAsync(stock);
        Assert.True(stockRes.IsSuccessStatusCode, $"cargar stock falló: {stockRes.StatusCode}");

        return variantId;
    }

    private async Task<Guid> RegisterWithStoreAsync(HttpClient client, string tag)
    {
        var email = $"it-{tag}@test.local";
        const string password = "password-larga-123";

        using (var scope = _factory.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
            if (await users.FindByEmailAsync(email) is null)
            {
                var user = new AppUser
                {
                    UserName = email,
                    Email = email,
                    DisplayName = $"Test {tag}",
                    EmailConfirmed = true,
                };
                var created = await users.CreateAsync(user, password);
                Assert.True(created.Succeeded, string.Join(", ", created.Errors.Select(e => e.Description)));
            }
        }

        var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { email, password });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);

        var create = await client.PostAsJsonAsync("/api/v1/tenants", new { name = $"Tienda {tag}", subdomain = tag });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var tenant = await create.Content.ReadFromJsonAsync<JsonElement>(Json);
        return tenant.GetProperty("id").GetGuid();
    }
}
