using Checkout.Core.Domain;
using Microsoft.EntityFrameworkCore;

namespace Checkout.Infrastructure.Persistence;

public sealed class ZipnovaRepository(CheckoutDbContext context) : IZipnovaRepository
{
    public Task<ZipnovaConfig?> GetConfigAsync(Guid tenantId, CancellationToken ct = default) =>
        context.ZipnovaConfigs.FirstOrDefaultAsync(c => c.TenantId == tenantId, ct);

    public async Task AddConfigAsync(ZipnovaConfig config, CancellationToken ct = default) =>
        await context.ZipnovaConfigs.AddAsync(config, ct);

    public Task RemoveConfigAsync(ZipnovaConfig config, CancellationToken ct = default)
    {
        context.ZipnovaConfigs.Remove(config);
        return Task.CompletedTask;
    }

    public Task<ZipnovaShipment?> GetShipmentByOrderAsync(Guid tenantId, Guid orderId, CancellationToken ct = default) =>
        context.ZipnovaShipments.FirstOrDefaultAsync(s => s.TenantId == tenantId && s.OrderId == orderId, ct);

    public async Task AddShipmentAsync(ZipnovaShipment shipment, CancellationToken ct = default) =>
        await context.ZipnovaShipments.AddAsync(shipment, ct);

    public Task SaveChangesAsync(CancellationToken ct = default) =>
        context.SaveChangesAsync(ct);
}
