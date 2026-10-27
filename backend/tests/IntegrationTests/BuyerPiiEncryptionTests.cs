using Api.Startup;
using Checkout.Infrastructure.Persistence;
using Fiscal.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Orders.Infrastructure.Persistence;
using SharedKernel.Persistence;

namespace IntegrationTests;

/// <summary>
/// Teléfono, documento y dirección del comprador cifrados en reposo en ventas y
/// checkouts. Lo que se mira es la base con SQL crudo (ahí no tiene que estar
/// el dato) y que todo lo que los usa —el detalle, la planilla, el despacho, la
/// factura— siga recibiendo el valor de verdad.
/// </summary>
[Collection("api")]
public sealed class BuyerPiiEncryptionTests(ApiFactory factory)
{
    private const string Phone = "11 5555-4444";
    private const string Doc = "30111222";
    private const string Address = "Av. Siempreviva 742, Springfield (1234)";

    [Fact]
    public async Task La_venta_guarda_cifrados_telefono_documento_y_direccion_y_todo_lo_demas_los_lee_bien()
    {
        var merchant = await Merchant.CreateAsync(factory, "pii");
        _ = new FakeArca(factory.ExternalHttp); // ARCA simulado (atiende el HTTP de la API)
        await merchant.ConfigureFiscalAsync();
        var id = await ManualSaleAsync(merchant);

        // En la base: ciphertext de DataProtection, no el dato.
        foreach (var (column, plain) in new[] { ("buyer_phone", Phone), ("doc_number", Doc), ("shipping_address", Address) })
        {
            var stored = await OrderColumnAsync(id, column);
            Assert.NotEqual(plain, stored);
            Assert.StartsWith(PiiColumns.ProtectedPrefix, stored, StringComparison.Ordinal);
            Assert.DoesNotContain(plain, stored, StringComparison.Ordinal);
        }

        // El detalle del panel.
        var detail = await merchant.GetAsync($"/api/v1/orders/{id}");
        Assert.Equal(Phone, detail.GetProperty("buyerPhone").GetString());
        Assert.Equal(Doc, detail.GetProperty("docNumber").GetString());
        Assert.Equal(Address, detail.GetProperty("shippingAddress").GetString());

        // La planilla de ventas.
        var csv = await (await merchant.ExpectOkAsync(HttpMethod.Get, "/api/v1/orders/export")).Content.ReadAsStringAsync();
        Assert.Contains(Doc, csv, StringComparison.Ordinal);
        Assert.Contains(Phone, csv, StringComparison.Ordinal);
        Assert.Contains("Av. Siempreviva 742", csv, StringComparison.Ordinal);
        Assert.DoesNotContain(PiiColumns.ProtectedPrefix, csv, StringComparison.Ordinal);

        // El despacho (de donde sale la etiqueta).
        var resolved = await merchant.GetAsync($"/api/v1/fulfillment/orders/resolve?code={id}");
        Assert.Equal(Address, resolved.GetProperty("shippingAddress").GetString());

        // La factura: sin documento en el pedido de facturar, ARCA recibe el de la venta.
        var invoice = await merchant.PostAsync($"/api/v1/orders/{id}/invoice", new { });
        Assert.True(invoice.GetProperty("authorized").GetBoolean(), invoice.ToString());
        await using var scope = factory.Services.CreateAsyncScope();
        var fiscal = scope.ServiceProvider.GetRequiredService<FiscalDbContext>();
        var document = await fiscal.Documents.IgnoreQueryFilters().AsNoTracking().SingleAsync(d => d.OrderId == id);
        Assert.Equal(long.Parse(Doc), document.DocNro);
        Assert.Contains(factory.ExternalHttp.SentTo(FakeArca.Wsfe), r => r.Body!.Contains(Doc, StringComparison.Ordinal));
    }

    [Fact]
    public async Task El_checkout_guarda_cifrados_telefono_documento_y_direccion()
    {
        var merchant = await Merchant.CreateAsync(factory, "piic");
        var (_, variantId) = await merchant.CreateProductAsync("Mate", priceMinor: 10_000_00, stock: 5);
        var delivery = await merchant.PostAsync("/api/v1/admin/shipping/methods",
            new { name = "Moto", kind = "delivery", price = 2500m, sortOrder = 1 });
        var shopper = new Shopper(merchant);
        var id = await shopper.CheckoutAsync(variantId, shippingMethodId: delivery.GetProperty("id").GetGuid(), address: Address);

        foreach (var (column, plain) in new[] { ("phone", "1155556666"), ("doc_number", Doc), ("shipping_address", Address) })
        {
            var stored = await SessionColumnAsync(id, column);
            Assert.StartsWith(PiiColumns.ProtectedPrefix, stored, StringComparison.Ordinal);
            Assert.DoesNotContain(plain, stored, StringComparison.Ordinal);
        }

        var session = await shopper.ExpectJsonAsync(HttpMethod.Get, $"/api/v1/checkout/{id}");
        Assert.Equal(Address, session.GetProperty("shippingAddress").GetString());
        await using var scope = factory.Services.CreateAsyncScope();
        var read = await scope.ServiceProvider.GetRequiredService<CheckoutDbContext>().Sessions.IgnoreQueryFilters().AsNoTracking().SingleAsync(s => s.Id == id);
        Assert.Equal("1155556666", read.Phone);
        Assert.Equal(Doc, read.DocNumber);
    }

    [Fact]
    public async Task Las_filas_viejas_en_claro_se_leen_y_las_cifra_el_arranque_de_la_version_nueva_no_migrate()
    {
        var merchant = await Merchant.CreateAsync(factory, "piil");
        var (_, variantId) = await merchant.CreateProductAsync("Termo", priceMinor: 10_000_00, stock: 5);
        var orderId = await ManualSaleAsync(merchant);
        var sessionId = await new Shopper(merchant).CheckoutAsync(variantId);

        // Como quedaron las de antes del cifrado: en claro.
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var orders = scope.ServiceProvider.GetRequiredService<OrdersDbContext>();
            await orders.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE orders SET buyer_phone = '1144443333', doc_number = '27999888', shipping_address = 'Calle Vieja 123' WHERE id = {orderId}");
            var checkout = scope.ServiceProvider.GetRequiredService<CheckoutDbContext>();
            await checkout.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE checkout_sessions SET phone = '1144443333', doc_number = '27999888', shipping_address = NULL WHERE id = {sessionId}");
        }

        // Se leen igual.
        await AssertOldValuesAsync(merchant, orderId, sessionId);

        // El paso de migración (`dotnet Api.dll migrate`) NO las cifra: corre con
        // la versión vieja todavía atendiendo, que leería cifrado (CfDJ8...) el
        // teléfono, el DNI y la dirección.
        await factory.Services.MigrateDatabaseAsync();
        Assert.Equal("1144443333", await OrderColumnAsync(orderId, "buyer_phone"));
        Assert.Equal("27999888", await SessionColumnAsync(sessionId, "doc_number"));

        // Las cifra el arranque de la versión nueva (BuyerPiiBackfillService).
        var service = new BuyerPiiBackfillService(factory.Services, NullLogger<BuyerPiiBackfillService>.Instance);
        await service.StartAsync(CancellationToken.None);
        await service.ExecuteTask!;

        // Quedaron cifradas (y lo que era NULL sigue NULL)...
        Assert.StartsWith(PiiColumns.ProtectedPrefix, await OrderColumnAsync(orderId, "buyer_phone"), StringComparison.Ordinal);
        Assert.StartsWith(PiiColumns.ProtectedPrefix, await OrderColumnAsync(orderId, "doc_number"), StringComparison.Ordinal);
        Assert.StartsWith(PiiColumns.ProtectedPrefix, await OrderColumnAsync(orderId, "shipping_address"), StringComparison.Ordinal);
        Assert.StartsWith(PiiColumns.ProtectedPrefix, await SessionColumnAsync(sessionId, "phone"), StringComparison.Ordinal);
        Assert.StartsWith(PiiColumns.ProtectedPrefix, await SessionColumnAsync(sessionId, "doc_number"), StringComparison.Ordinal);
        Assert.Null(await SessionColumnAsync(sessionId, "shipping_address"));

        // ...y se siguen leyendo igual.
        await AssertOldValuesAsync(merchant, orderId, sessionId);

        // Una segunda pasada no vuelve a cifrar lo cifrado.
        var before = await OrderColumnAsync(orderId, "buyer_phone");
        await BuyerPiiBackfill.RunAsync(factory.Services, NullLogger.Instance);
        Assert.Equal(before, await OrderColumnAsync(orderId, "buyer_phone"));
    }

    private async Task AssertOldValuesAsync(Merchant merchant, Guid orderId, Guid sessionId)
    {
        var detail = await merchant.GetAsync($"/api/v1/orders/{orderId}");
        Assert.Equal("1144443333", detail.GetProperty("buyerPhone").GetString());
        Assert.Equal("27999888", detail.GetProperty("docNumber").GetString());
        Assert.Equal("Calle Vieja 123", detail.GetProperty("shippingAddress").GetString());

        await using var scope = factory.Services.CreateAsyncScope();
        var session = await scope.ServiceProvider.GetRequiredService<CheckoutDbContext>().Sessions.IgnoreQueryFilters().AsNoTracking()
            .SingleAsync(s => s.Id == sessionId);
        Assert.Equal("1144443333", session.Phone);
        Assert.Equal("27999888", session.DocNumber);
        Assert.Null(session.ShippingAddress);
    }

    private static async Task<Guid> ManualSaleAsync(Merchant merchant)
    {
        var (_, variantId) = await merchant.CreateProductAsync($"Producto {Guid.NewGuid():N}"[..20], priceMinor: 10_000_00, stock: 5);
        var sale = await merchant.PostAsync("/api/v1/orders/manual", new
        {
            items = new[] { new { variantId, quantity = 1 } },
            paymentMethod = "cash",
            buyerEmail = "pii@test.local",
            buyerName = "Ana Pérez",
            buyerPhone = Phone,
            docNumber = Doc,
            shippingAddress = Address,
        });
        return sale.GetProperty("id").GetGuid();
    }

    private Task<string?> OrderColumnAsync(Guid id, string column) => ColumnAsync<OrdersDbContext>("orders", column, id);

    private Task<string?> SessionColumnAsync(Guid id, string column) => ColumnAsync<CheckoutDbContext>("checkout_sessions", column, id);

    /// <summary>Lo que hay de verdad en la columna, sin pasar por el converter de EF.</summary>
    private async Task<string?> ColumnAsync<TContext>(string table, string column, Guid id) where TContext : DbContext
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TContext>();
        // Tabla y columna son constantes de este archivo; el id va como parámetro.
        var sql = "SELECT " + column + " AS \"Value\" FROM " + table + " WHERE id = {0}";
        var rows = await db.Database.SqlQueryRaw<string?>(sql, id).ToListAsync();
        return Assert.Single(rows);
    }
}
