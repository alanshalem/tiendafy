using Api.Orders;
using Catalog.Infrastructure;
using Catalog.Infrastructure.Persistence;
using Inventory.Core.Domain;
using Microsoft.Extensions.DependencyInjection;
using Orders.Core.Domain;
using SharedKernel.Common;

namespace IntegrationTests;

/// <summary>
/// Kits contra Postgres real: la devolución tiene que reingresar EXACTAMENTE
/// lo que descontó la venta. Sin ese espejo, reingresar un kit dejaba sus
/// piezas descontadas para siempre — y el faltante recién aparece meses
/// después, cuando el stock de una pieza no cierra con el conteo físico.
/// </summary>
[Collection("api")]
public sealed class KitStockTests
{
    private readonly ApiFactory _factory;

    public KitStockTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task DevolverUnKitReingresaLoMismoQueDescontoLaVenta()
    {
        using var scope = _factory.Services.CreateScope();
        var sp = scope.ServiceProvider;
        var catalog = sp.GetRequiredService<CatalogDbContext>();
        var stock = sp.GetRequiredService<IStockRepository>();
        var kits = sp.GetRequiredService<KitStockService>();

        var tenantGuid = Guid.NewGuid();
        var tenant = TenantId.From(tenantGuid);
        scope.ServiceProvider.GetRequiredService<Api.Middleware.TenantContextHolder>().Set(tenant); // como un request de esa tienda
        var kitVariant = Guid.NewGuid();
        var pieceA = Guid.NewGuid();
        var pieceB = Guid.NewGuid();

        // Un kit que lleva 2 unidades de A y 1 de B.
        catalog.KitComponents.AddRange(
            new KitComponent(tenantGuid, kitVariant, pieceA, 2),
            new KitComponent(tenantGuid, kitVariant, pieceB, 1));
        await catalog.SaveChangesAsync();

        await stock.AdjustAvailableAsync(tenant, pieceA, 10, "alta");
        await stock.AdjustAvailableAsync(tenant, pieceB, 10, "alta");

        var order = Order.Create(
            tenant, Guid.NewGuid(), "buyer@test.com", "ARS",
            [(kitVariant, "Kit", "", "KIT-1", new Money(10_000, "ARS"), 3, (Guid?)null, (Money?)null)]).Value;

        // Venta de 3 kits: se van 6 de A y 3 de B.
        await kits.ApplyAsync(order, default);
        Assert.Equal(4, await AvailableAsync(pieceA));
        Assert.Equal(7, await AvailableAsync(pieceB));

        // Devolución: vuelve todo, sin dejar rastro.
        await kits.ReverseAsync(order, default);
        Assert.Equal(10, await AvailableAsync(pieceA));
        Assert.Equal(10, await AvailableAsync(pieceB));

        async Task<int> AvailableAsync(Guid variantId) =>
            (await stock.GetByVariantsAsync(tenant, [variantId]))[0].Available;
    }

    [Fact]
    public async Task UnaVentaSinKitsNoToca_ningun_stock()
    {
        using var scope = _factory.Services.CreateScope();
        var sp = scope.ServiceProvider;
        var stock = sp.GetRequiredService<IStockRepository>();
        var kits = sp.GetRequiredService<KitStockService>();

        var tenant = TenantId.From(Guid.NewGuid());
        scope.ServiceProvider.GetRequiredService<Api.Middleware.TenantContextHolder>().Set(tenant);
        var plainVariant = Guid.NewGuid();
        await stock.AdjustAvailableAsync(tenant, plainVariant, 5, "alta");

        var order = Order.Create(
            tenant, Guid.NewGuid(), "buyer@test.com", "ARS",
            [(plainVariant, "Producto suelto", "", "SKU-1", new Money(1_000, "ARS"), 2, (Guid?)null, (Money?)null)]).Value;

        await kits.ApplyAsync(order, default);

        // El stock del producto vendido lo maneja la reserva del checkout, no esto.
        var rows = await stock.GetByVariantsAsync(tenant, [plainVariant]);
        Assert.Equal(5, rows[0].Available);
    }
}
