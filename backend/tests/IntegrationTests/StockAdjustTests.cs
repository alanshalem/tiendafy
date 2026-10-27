using Inventory.Core.Domain;
using Microsoft.Extensions.DependencyInjection;
using SharedKernel.Common;

namespace IntegrationTests;

/// <summary>
/// AdjustAvailableAsync contra Postgres real: el delta atómico convive con las
/// reservas del checkout sin pisarlas (el bug que reemplaza era el
/// read-modify-write de recepción de compras / venta ML / componentes de kit).
/// </summary>
[Collection("api")]
public sealed class StockAdjustTests
{
    private readonly ApiFactory _factory;

    public StockAdjustTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task AdjustAvailable_EsAtomicoConviveConReservasYClampeaACero()
    {
        using var scope = _factory.Services.CreateScope();
        var stock = scope.ServiceProvider.GetRequiredService<IStockRepository>();
        var tenant = TenantId.From(Guid.NewGuid());
        scope.ServiceProvider.GetRequiredService<Api.Middleware.TenantContextHolder>().Set(tenant); // como un request de esa tienda
        var variant = Guid.NewGuid();

        // Sobre variante sin fila de stock: crea, y un delta negativo queda en 0.
        Assert.Equal(0, await stock.AdjustAvailableAsync(tenant, variant, -3, "test"));
        Assert.Equal(10, await stock.AdjustAvailableAsync(tenant, variant, 10, "test"));

        // Un checkout reserva 3 en el medio; el ajuste por delta NO pisa la reserva
        // (el set absoluto anterior habría devuelto el stock reservado).
        var reserved = await stock.TryReserveAsync(tenant, variant, 3);
        Assert.True(reserved.IsSuccess);
        Assert.Equal(2, await stock.AdjustAvailableAsync(tenant, variant, -5, "venta ML"));

        var rows = await stock.GetByVariantsAsync(tenant, [variant]);
        Assert.Equal(2, rows[0].Available);
        Assert.Equal(3, rows[0].Reserved);

        // Nunca negativo (GREATEST(0, …) en el propio UPDATE).
        Assert.Equal(0, await stock.AdjustAvailableAsync(tenant, variant, -99, "test"));
    }
}
