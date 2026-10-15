using Checkout.Core.Domain;
using Microsoft.EntityFrameworkCore;

namespace Checkout.Infrastructure.Persistence;

public sealed class CorreoArgentinoConfigRepository(CheckoutDbContext context) : ICorreoArgentinoConfigRepository
{
    public Task<CorreoArgentinoConfig?> GetAsync(Guid tenantId, CancellationToken ct = default) =>
        context.CorreoArgentinoConfigs.FirstOrDefaultAsync(c => c.TenantId == tenantId, ct);

    public async Task AddAsync(CorreoArgentinoConfig config, CancellationToken ct = default) =>
        await context.CorreoArgentinoConfigs.AddAsync(config, ct);

    public Task RemoveAsync(CorreoArgentinoConfig config, CancellationToken ct = default)
    {
        context.CorreoArgentinoConfigs.Remove(config);
        return Task.CompletedTask;
    }

    public Task<CorreoShipment?> GetShipmentByOrderAsync(Guid tenantId, Guid orderId, CancellationToken ct = default) =>
        context.CorreoShipments.FirstOrDefaultAsync(s => s.TenantId == tenantId && s.OrderId == orderId, ct);

    public async Task AddShipmentAsync(CorreoShipment shipment, CancellationToken ct = default) =>
        await context.CorreoShipments.AddAsync(shipment, ct);

    public Task SaveChangesAsync(CancellationToken ct = default) =>
        context.SaveChangesAsync(ct);
}
