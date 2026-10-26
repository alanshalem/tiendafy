using Api.Crm;
using Api.Purchasing;
using Api.Stats;
using Customers.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Purchasing.Infrastructure;

namespace IntegrationTests;

/// <summary>
/// Las consultas de inventario, compras y clientes que comparten el panel y el
/// asistente filtran por tienda con el <c>Where(TenantId)</c> explícito: acá
/// corren en un scope SIN tienda (el filtro global de EF apagado, como el worker
/// de alertas), así que si el filtro explícito faltara, verían las dos tiendas.
/// </summary>
[Collection("api")]
public sealed class StatsQueriesTenantTests(ApiFactory factory)
{
    private static readonly PurchaseOrderFilter All = new(null, PurchaseOrderGroup.All, null);

    [Fact]
    public async Task Compras_filtran_por_tienda_sin_filtro_global()
    {
        var (a, _) = await TwoStoresAsync();

        await using var scope = factory.Services.CreateAsyncScope();
        var queries = scope.ServiceProvider.GetRequiredService<PurchaseOrderQueries>();

        Assert.Equal(2, queries.Filtered(a.TenantId, All).Count());
        Assert.Equal(2, (await queries.SummaryAsync(a.TenantId, CancellationToken.None)).Total);
    }

    [Fact]
    public async Task Inventario_filtra_por_tienda_sin_filtro_global()
    {
        var (a, _) = await TwoStoresAsync();

        await using var scope = factory.Services.CreateAsyncScope();
        var summary = await scope.ServiceProvider.GetRequiredService<InventorySummaryQuery>()
            .RunAsync(SharedKernel.Common.TenantId.From(a.TenantId), 5, CancellationToken.None);

        Assert.Equal(2, summary.Variants);
        Assert.Equal(7, summary.Units); // 3 + 4 de A; las 10 de B no suman
    }

    [Fact]
    public async Task Clientes_filtran_por_tienda()
    {
        var (a, _) = await TwoStoresAsync();

        await using var scope = factory.Services.CreateAsyncScope();
        var summary = await RunCustomersAsync(scope, a.TenantId);

        Assert.Equal(4, summary.Total);
    }

    [Fact]
    public async Task Resumen_de_clientes_cuenta_segmentos()
    {
        var (a, _) = await TwoStoresAsync();

        await using var scope = factory.Services.CreateAsyncScope();
        var summary = await RunCustomersAsync(scope, a.TenantId);

        Assert.Equal(3, summary.WithPurchases);
        Assert.Equal(1, summary.Repeat);
        Assert.Equal(1, summary.NeverBought);
        Assert.Equal(1, summary.Inactive90);
        Assert.Equal(4, summary.NewInPeriod); // todos se dieron de alta hoy
        Assert.Equal(0, summary.NewPrevious);
        Assert.Equal(20_000, summary.AverageSpentMinor); // (10.000 + 40.000 + 10.000) / 3
    }

    private static Task<CustomerSummary> RunCustomersAsync(AsyncServiceScope scope, Guid tenantId)
    {
        var now = DateTime.UtcNow;
        return scope.ServiceProvider.GetRequiredService<CustomerSummaryQuery>()
            .RunAsync(tenantId, now.AddDays(-30), now.AddDays(1), now, CancellationToken.None);
    }

    /// <summary>
    /// Dos tiendas con datos en las tres áreas. A: 2 OC, stock 3 + 4, y 4 clientes
    /// (sin compras, con 1, con 3 y uno que compró hace 120 días). B: 1 OC, stock 10, 1 cliente.
    /// </summary>
    private async Task<(Merchant A, Merchant B)> TwoStoresAsync()
    {
        var a = await Merchant.CreateAsync(factory, "sqa");
        var b = await Merchant.CreateAsync(factory, "sqb");

        await a.CreateProductAsync("Producto A1", stock: 3);
        await a.CreateProductAsync("Producto A2", stock: 4);
        await b.CreateProductAsync("Producto B1", stock: 10);

        await using var scope = factory.Services.CreateAsyncScope();
        var purchasing = scope.ServiceProvider.GetRequiredService<PurchasingDbContext>();
        purchasing.PurchaseOrders.Add(PurchaseOrder.Create(a.TenantId, "Proveedor 1").Value);
        purchasing.PurchaseOrders.Add(PurchaseOrder.Create(a.TenantId, "Proveedor 2").Value);
        purchasing.PurchaseOrders.Add(PurchaseOrder.Create(b.TenantId, "Proveedor 3").Value);
        await purchasing.SaveChangesAsync();

        var customers = scope.ServiceProvider.GetRequiredService<CustomersDbContext>();
        var now = DateTime.UtcNow;
        AddCustomer(customers, a.TenantId, 0, 0, null);
        AddCustomer(customers, a.TenantId, 1, 10_000, now.AddDays(-5));
        AddCustomer(customers, a.TenantId, 3, 40_000, now.AddDays(-2));
        AddCustomer(customers, a.TenantId, 1, 10_000, now.AddDays(-120));
        AddCustomer(customers, b.TenantId, 2, 99_000, now.AddDays(-1));
        await customers.SaveChangesAsync();

        return (a, b);
    }

    private static void AddCustomer(CustomersDbContext db, Guid tenantId, int orders, long spent, DateTime? last)
    {
        var customer = Customer.Create(tenantId, "Cliente", $"{Guid.NewGuid():N}@test.local", null, null, null).Value;
        customer.SetPurchaseStats(orders, spent, last);
        db.Customers.Add(customer);
    }
}
