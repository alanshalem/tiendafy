using Api.Crm;
using Api.Purchasing;
using Api.Stats;
using Customers.Infrastructure;
using Inventory.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Purchasing.Infrastructure;

namespace IntegrationTests;

/// <summary>
/// Las consultas de inventario, compras y clientes que comparten el panel y el
/// asistente filtran por tienda: corren en un scope con la tienda fijada (como un
/// request del panel o el worker de alertas, que fija la de cada tienda) y con
/// datos de otra tienda al lado, que no tienen que sumar. Un scope sin tienda
/// no ve filas de ninguna (el filtro global está cerrado por defecto).
/// </summary>
[Collection("api")]
public sealed class StatsQueriesTenantTests(ApiFactory factory)
{
    /// <summary>Inicio del período de los clientes: fijo, para sembrar altas justo en el borde.</summary>
    private static readonly DateTime PeriodStart = DateTime.UtcNow.Date.AddDays(-30);

    private static readonly PurchaseOrderFilter All = new(null, PurchaseOrderGroup.All, null);

    [Fact]
    public async Task Compras_filtran_por_tienda_sin_filtro_global()
    {
        var (a, _) = await TwoStoresAsync();

        await using var scope = factory.Services.CreateTenantScope(a.TenantId);
        var queries = scope.ServiceProvider.GetRequiredService<PurchaseOrderQueries>();

        Assert.Equal(2, queries.Filtered(a.TenantId, All).Count());
        Assert.Equal(2, (await queries.SummaryAsync(a.TenantId, CancellationToken.None)).Total);
    }

    [Fact]
    public async Task Inventario_filtra_por_tienda_sin_filtro_global()
    {
        var (a, _) = await TwoStoresAsync();

        await using var scope = factory.Services.CreateTenantScope(a.TenantId);
        var summary = await scope.ServiceProvider.GetRequiredService<InventorySummaryQuery>()
            .RunAsync(SharedKernel.Common.TenantId.From(a.TenantId), 5, CancellationToken.None);

        Assert.Equal(2, summary.Variants);
        Assert.Equal(7, summary.Units); // 3 + 4 de A; las 10 de B no suman
        Assert.Equal(0, summary.Reserved); // las 3 reservadas de B tampoco
    }

    [Fact]
    public async Task Clientes_filtran_por_tienda()
    {
        var (a, _) = await TwoStoresAsync();

        await using var scope = factory.Services.CreateTenantScope(a.TenantId);
        var summary = await RunCustomersAsync(scope, a.TenantId);

        Assert.Equal(6, summary.Total);
    }

    [Fact]
    public async Task Resumen_de_clientes_cuenta_segmentos()
    {
        var (a, _) = await TwoStoresAsync();

        await using var scope = factory.Services.CreateTenantScope(a.TenantId);
        var summary = await RunCustomersAsync(scope, a.TenantId);

        Assert.Equal(5, summary.WithPurchases);
        Assert.Equal(1, summary.Repeat);
        Assert.Equal(1, summary.NeverBought);
        Assert.Equal(1, summary.Inactive90);
        // Los 4 de hoy y el que se dio de alta justo en el inicio del período (inclusive);
        // el del período anterior no cuenta acá.
        Assert.Equal(5, summary.NewInPeriod);
        Assert.Equal(1, summary.NewPrevious);
        Assert.Equal(16_000, summary.AverageSpentMinor); // (10.000 + 40.000 + 10.000 + 10.000 + 10.000) / 5
    }

    [Fact]
    public async Task Carritos_abandonados_filtran_por_tienda_sin_filtro_global()
    {
        var a = await Merchant.CreateAsync(factory, "sqca");
        var b = await Merchant.CreateAsync(factory, "sqcb");
        var shared = $"mismo-{a.Subdomain}@mail.com";
        var (_, variantA) = await a.CreateProductAsync("Mochila A", priceMinor: 40_000_00);
        var (_, variantB) = await b.CreateProductAsync("Mochila B", priceMinor: 9_000_00);
        var cartA = await new Shopper(a).SaveContactAsync(variantA, shared);
        var cartB = await new Shopper(b).SaveContactAsync(variantB, shared); // más nuevo, mismo mail, OTRA tienda

        var since = DateTime.UtcNow.AddDays(-1);
        // Cada tienda con la suya fijada, como el panel de cada una.
        IReadOnlyList<Checkout.Core.Domain.CheckoutSession> pendingA, pendingB;
        await using (var scope = factory.Services.CreateTenantScope(a.TenantId))
            pendingA = await scope.ServiceProvider.GetRequiredService<AbandonedCartsQuery>()
                .PendingAsync(SharedKernel.Common.TenantId.From(a.TenantId), since, null, CancellationToken.None);
        await using (var scope = factory.Services.CreateTenantScope(b.TenantId))
            pendingB = await scope.ServiceProvider.GetRequiredService<AbandonedCartsQuery>()
                .PendingAsync(SharedKernel.Common.TenantId.From(b.TenantId), since, null, CancellationToken.None);

        // La compra posterior de B no reemplaza el carrito de A: son tiendas distintas.
        Assert.Equal(cartA, Assert.Single(pendingA).Id);
        Assert.Equal(cartB, Assert.Single(pendingB).Id);
    }

    private static Task<CustomerSummary> RunCustomersAsync(AsyncServiceScope scope, Guid tenantId)
    {
        var now = DateTime.UtcNow;
        return scope.ServiceProvider.GetRequiredService<CustomerSummaryQuery>()
            .RunAsync(tenantId, PeriodStart, now.AddDays(1), now, CancellationToken.None);
    }

    /// <summary>
    /// Dos tiendas con datos en las tres áreas. A: 2 OC, stock 3 + 4, y 4 clientes
    /// (sin compras, con 1, con 3 y uno que compró hace 120 días), más uno dado de alta justo
    /// en <see cref="PeriodStart"/> con la última compra a 89 días (no es inactivo) y uno del
    /// período anterior. B: 1 OC, stock 10 con 3 reservadas, 1 cliente.
    /// </summary>
    private async Task<(Merchant A, Merchant B)> TwoStoresAsync()
    {
        var a = await Merchant.CreateAsync(factory, "sqa");
        var b = await Merchant.CreateAsync(factory, "sqb");

        await a.CreateProductAsync("Producto A1", stock: 3);
        await a.CreateProductAsync("Producto A2", stock: 4);
        var (_, variantB) = await b.CreateProductAsync("Producto B1", stock: 10);

        await using var scope = factory.Services.CreateAsyncScope();
        var purchasing = scope.ServiceProvider.GetRequiredService<PurchasingDbContext>();
        purchasing.PurchaseOrders.Add(PurchaseOrder.Create(a.TenantId, "Proveedor 1").Value);
        purchasing.PurchaseOrders.Add(PurchaseOrder.Create(a.TenantId, "Proveedor 2").Value);
        purchasing.PurchaseOrders.Add(PurchaseOrder.Create(b.TenantId, "Proveedor 3").Value);
        await purchasing.SaveChangesAsync();

        // Reservado de B: si el stock no filtrara por tienda, el resumen de A lo sumaría.
        await scope.ServiceProvider.GetRequiredService<InventoryDbContext>().StockItems.IgnoreQueryFilters()
            .Where(s => s.VariantId == variantB)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.Reserved, 3));

        var customers = scope.ServiceProvider.GetRequiredService<CustomersDbContext>();
        var now = DateTime.UtcNow;
        AddCustomer(customers, a.TenantId, 0, 0, null);
        AddCustomer(customers, a.TenantId, 1, 10_000, now.AddDays(-5));
        AddCustomer(customers, a.TenantId, 3, 40_000, now.AddDays(-2));
        AddCustomer(customers, a.TenantId, 1, 10_000, now.AddDays(-120));
        var atStart = AddCustomer(customers, a.TenantId, 1, 10_000, now.AddDays(-89));
        var previous = AddCustomer(customers, a.TenantId, 1, 10_000, now.AddDays(-10));
        AddCustomer(customers, b.TenantId, 2, 99_000, now.AddDays(-1));
        await customers.SaveChangesAsync();

        await SetCreatedAtAsync(customers, atStart, PeriodStart);
        await SetCreatedAtAsync(customers, previous, PeriodStart.AddDays(-10));

        return (a, b);
    }

    private static async Task SetCreatedAtAsync(CustomersDbContext db, Guid id, DateTime createdAt) =>
        await db.Customers.IgnoreQueryFilters().Where(c => c.Id == id)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.CreatedAtUtc, createdAt));

    private static Guid AddCustomer(CustomersDbContext db, Guid tenantId, int orders, long spent, DateTime? last)
    {
        var customer = Customer.Create(tenantId, "Cliente", $"{Guid.NewGuid():N}@test.local", null, null, null).Value;
        customer.SetPurchaseStats(orders, spent, last);
        db.Customers.Add(customer);
        return customer.Id;
    }
}
