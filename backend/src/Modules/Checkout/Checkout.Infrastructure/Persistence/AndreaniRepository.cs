using Checkout.Core.Domain;
using Microsoft.EntityFrameworkCore;

namespace Checkout.Infrastructure.Persistence;

public sealed class AndreaniRepository(CheckoutDbContext context) : IAndreaniRepository
{
    public Task<AndreaniConfig?> GetConfigAsync(Guid tenantId, CancellationToken ct = default) =>
        context.AndreaniConfigs.FirstOrDefaultAsync(c => c.TenantId == tenantId, ct);

    public async Task AddConfigAsync(AndreaniConfig config, CancellationToken ct = default) =>
        await context.AndreaniConfigs.AddAsync(config, ct);

    public Task RemoveConfigAsync(AndreaniConfig config, CancellationToken ct = default)
    {
        context.AndreaniConfigs.Remove(config);
        return Task.CompletedTask;
    }

    public Task<AndreaniShipment?> GetShipmentByOrderAsync(Guid tenantId, Guid orderId, CancellationToken ct = default) =>
        context.AndreaniShipments.FirstOrDefaultAsync(s => s.TenantId == tenantId && s.OrderId == orderId, ct);

    public async Task AddShipmentAsync(AndreaniShipment shipment, CancellationToken ct = default) =>
        await context.AndreaniShipments.AddAsync(shipment, ct);

    public Task SaveChangesAsync(CancellationToken ct = default) =>
        context.SaveChangesAsync(ct);
}
