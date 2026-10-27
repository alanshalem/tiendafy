using System.Net;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Orders.Core.Domain;
using Orders.Infrastructure.Persistence;
using SharedKernel.Common;

namespace IntegrationTests;

/// <summary>
/// Número de pedido por tienda (#1001, #1002, …): correlativo, sin repetidos
/// aunque muchas ventas se guarden a la vez, y con las ventas viejas numeradas
/// en el orden en que se hicieron.
/// </summary>
[Collection("api")]
public sealed class OrderNumberTests(ApiFactory factory)
{
    private static Order NewOrder(TenantId tenant, string email = "buyer@test.local") =>
        Order.Create(tenant, Guid.NewGuid(), email, "ARS",
            [(Guid.NewGuid(), "Termo", "", "T-1", new Money(10_000, "ARS"), 1, (Guid?)null, (Money?)null)]).Value;

    [Fact]
    public async Task Ventas_simultaneas_de_una_tienda_nunca_repiten_numero()
    {
        var tenant = TenantId.From(Guid.NewGuid());
        var other = TenantId.From(Guid.NewGuid());

        // 30 checkouts que guardan su orden al mismo tiempo, cada uno con su
        // propio DbContext (como requests distintos), más una tienda vecina.
        var saves = Enumerable.Range(0, 30).Select(async i =>
        {
            await using var scope = factory.Services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<OrdersDbContext>();
            var order = NewOrder(i % 5 == 0 ? other : tenant);
            db.Orders.Add(order);
            await db.SaveChangesAsync();
            return (order.TenantId, order.Number);
        });
        var results = await Task.WhenAll(saves);

        var mine = results.Where(r => r.TenantId == tenant).Select(r => r.Number).Order().ToArray();
        var theirs = results.Where(r => r.TenantId == other).Select(r => r.Number).Order().ToArray();
        Assert.Equal(Enumerable.Range(OrderLabel.FirstNumber, 24), mine);
        Assert.Equal(Enumerable.Range(OrderLabel.FirstNumber, 6), theirs);
    }

    [Fact]
    public async Task Un_lote_se_numera_en_el_orden_en_que_se_creo()
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<OrdersDbContext>();
        var tenant = TenantId.From(Guid.NewGuid());
        var first = NewOrder(tenant);
        await Task.Delay(5);
        var second = NewOrder(tenant);
        db.Orders.AddRange(second, first);
        await db.SaveChangesAsync();

        Assert.Equal(1001, first.Number);
        Assert.Equal(1002, second.Number);
        Assert.Equal("#1001", first.Label);

        // Un número dado no se pisa al volver a guardar.
        first.AssignNumber(5);
        await db.SaveChangesAsync();
        Assert.Equal(1001, (await db.Orders.IgnoreQueryFilters().AsNoTracking().SingleAsync(o => o.Id == first.Id)).Number);
    }

    [Fact]
    public async Task La_venta_nace_con_numero_y_se_busca_por_numero_en_el_panel()
    {
        var merchant = await Merchant.CreateAsync(factory, "num");
        var a = await merchant.CreateSaleAsync(buyerEmail: "ana@test.local");
        var b = await merchant.CreateSaleAsync(buyerEmail: "beto@test.local");

        var orderA = await merchant.GetAsync($"/api/v1/orders/{a}");
        var orderB = await merchant.GetAsync($"/api/v1/orders/{b}");
        Assert.Equal(1001, orderA.GetProperty("number").GetInt32());
        Assert.Equal(1002, orderB.GetProperty("number").GetInt32());

        foreach (var q in new[] { "1002", "%231002", "%20%231002%20" })
        {
            var found = await merchant.GetAsync($"/api/v1/orders?limit=25&offset=0&q={q}");
            Assert.Equal([b], found.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("id").GetGuid()));
        }
        var byA = await merchant.GetAsync("/api/v1/orders?limit=25&offset=0&q=1001");
        Assert.Equal([a], byA.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("id").GetGuid()));
    }

    /// <summary>
    /// La migración, contra una base propia: se crea en el esquema de antes,
    /// se cargan ventas viejas (de dos tiendas, desordenadas) y se migra.
    /// </summary>
    [Fact]
    public async Task La_migracion_numera_las_ventas_viejas_en_orden_y_el_contador_sigue()
    {
        var baseCs = factory.Services.GetRequiredService<IConfiguration>().GetConnectionString("Default")!;
        var csb = new NpgsqlConnectionStringBuilder(baseCs) { Database = $"{new NpgsqlConnectionStringBuilder(baseCs).Database}_backfill_{Guid.NewGuid():N}"[..50] };
        var options = new DbContextOptionsBuilder<OrdersDbContext>()
            .UseNpgsql(csb.ConnectionString).UseSnakeCaseNamingConvention().Options;

        await using var db = new OrdersDbContext(options);
        try
        {
            await db.Database.GetService<IMigrator>().MigrateAsync("20261012131522_AddOrderIsPickup");

            var shopA = Guid.NewGuid();
            var shopB = Guid.NewGuid();
            var t0 = new DateTime(2026, 9, 1, 12, 0, 0, DateTimeKind.Utc);
            // (tienda, minutos desde t0): insertadas a propósito fuera de orden.
            (Guid Tenant, int Minutes, Guid Id)[] rows =
            [
                (shopA, 30, Guid.NewGuid()), (shopB, 5, Guid.NewGuid()), (shopA, 10, Guid.NewGuid()),
                (shopA, 20, Guid.NewGuid()), (shopB, 1, Guid.NewGuid()),
            ];
            foreach (var r in rows)
                await db.Database.ExecuteSqlAsync($"""
                    INSERT INTO orders (id, tenant_id, checkout_session_id, status, currency, buyer_email,
                        payment_provider, discount_amount, created_at_utc)
                    VALUES ({r.Id}, {r.Tenant}, {Guid.NewGuid()}, 'Paid', 'ARS', 'x@test.local',
                        'mercadopago', '0|ARS', {t0.AddMinutes(r.Minutes)})
                    """);

            await db.Database.MigrateAsync();

            var numbers = await db.Orders.IgnoreQueryFilters().AsNoTracking()
                .ToDictionaryAsync(o => o.Id, o => o.Number);
            int NumberOf(Guid tenant, int minutes) => numbers[rows.Single(r => r.Tenant == tenant && r.Minutes == minutes).Id];
            Assert.Equal(1001, NumberOf(shopA, 10));
            Assert.Equal(1002, NumberOf(shopA, 20));
            Assert.Equal(1003, NumberOf(shopA, 30));
            Assert.Equal(1001, NumberOf(shopB, 1));
            Assert.Equal(1002, NumberOf(shopB, 5));

            // La primera venta nueva de cada tienda sigue la serie.
            var next = NewOrder(TenantId.From(shopA));
            db.Orders.Add(next);
            await db.SaveChangesAsync();
            Assert.Equal(1004, next.Number);
        }
        finally
        {
            await db.Database.EnsureDeletedAsync();
        }
    }

    [Fact]
    public async Task Seguir_un_pedido_pide_email_y_numero_y_no_dice_si_el_email_existe()
    {
        var merchant = await Merchant.CreateAsync(factory, "seg");
        var orderId = await merchant.CreateSaleAsync(buyerEmail: "Ana@Test.Local");
        var number = (await merchant.GetAsync($"/api/v1/orders/{orderId}")).GetProperty("number").GetInt32();
        var shopper = new Shopper(merchant);

        // Email (con otras mayúsculas) + número con numeral: el pedido.
        var found = await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/shop/track-order",
            new { email = " ana@test.local ", number = $"#{number}" });
        Assert.Equal(orderId, found.GetProperty("id").GetGuid());
        Assert.Equal($"#{number}", found.GetProperty("label").GetString());
        Assert.Equal("received", found.GetProperty("timeline")[0].GetProperty("key").GetString());
        Assert.False(found.TryGetProperty("buyerPhone", out _));
        Assert.False(found.TryGetProperty("docNumber", out _));

        // Email equivocado, número que no existe, otra tienda: la MISMA respuesta.
        var wrongEmail = await shopper.SendAsync(HttpMethod.Post, "/api/v1/shop/track-order", new { email = "otra@test.local", number = $"{number}" });
        var wrongNumber = await shopper.SendAsync(HttpMethod.Post, "/api/v1/shop/track-order", new { email = "ana@test.local", number = "999999" });
        var garbage = await shopper.SendAsync(HttpMethod.Post, "/api/v1/shop/track-order", new { email = "", number = "abc" });
        var otherStore = await new Shopper(await merchant.OpenAnotherStoreAsync("seg2"))
            .SendAsync(HttpMethod.Post, "/api/v1/shop/track-order", new { email = "ana@test.local", number = $"{number}" });
        var bodies = new List<string>();
        foreach (var res in new[] { wrongEmail, wrongNumber, garbage, otherStore })
        {
            Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
            var problem = await res.Content.ReadFromJsonAsync<JsonElement>();
            bodies.Add($"{problem.GetProperty("title")}|{problem.GetProperty("detail")}");
        }
        Assert.Single(bodies.Distinct());

        // El link firmado del mail abre el pedido sin email ni número, y solo en su tienda.
        var token = found.GetProperty("trackingToken").GetString();
        var byLink = await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/shop/track-order", new { token });
        Assert.Equal(orderId, byLink.GetProperty("id").GetGuid());
        Assert.Equal(HttpStatusCode.NotFound, (await shopper.SendAsync(HttpMethod.Post, "/api/v1/shop/track-order",
            new { token = token + "x" })).StatusCode);

        // El resumen de la página de gracias, con el id.
        var summary = await shopper.ExpectJsonAsync(HttpMethod.Get, $"/api/v1/orders/{orderId}/summary");
        Assert.Equal(number, summary.GetProperty("number").GetInt32());
        Assert.Equal("A**@Test.Local", summary.GetProperty("buyerEmailHint").GetString());
    }

    [Fact]
    public async Task El_mail_de_la_compra_lleva_el_numero_y_el_link_para_seguirla()
    {
        var merchant = await Merchant.CreateAsync(factory, "mailnum");
        var email = $"mail-{merchant.Subdomain}@test.local";
        var orderId = await merchant.CreateSaleAsync(buyerEmail: email);
        var number = (await merchant.GetAsync($"/api/v1/orders/{orderId}")).GetProperty("number").GetInt32();

        var mail = factory.ExternalHttp.EmailsTo(email).First();
        Assert.Contains($"#{number}", mail.Subject);
        Assert.DoesNotContain(orderId.ToString(), mail.Subject);
        Assert.Contains("/seguimiento?t=", mail.Html);
    }
}
