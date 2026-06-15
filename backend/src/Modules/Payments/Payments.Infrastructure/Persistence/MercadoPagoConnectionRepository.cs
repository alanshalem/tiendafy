using Microsoft.EntityFrameworkCore;
using Payments.Core.Domain;
using SharedKernel.Common;

namespace Payments.Infrastructure.Persistence;

public sealed class MercadoPagoConnectionRepository(PaymentsDbContext context) : IMercadoPagoConnectionRepository
{
    public Task<MercadoPagoConnection?> GetByTenantAsync(TenantId tenantId, CancellationToken ct = default) =>
        context.MercadoPagoConnections.FirstOrDefaultAsync(c => c.TenantId == tenantId, ct);

    public async Task AddAsync(MercadoPagoConnection connection, CancellationToken ct = default) =>
        await context.MercadoPagoConnections.AddAsync(connection, ct);

    public Task RemoveAsync(MercadoPagoConnection connection, CancellationToken ct = default)
    {
        context.MercadoPagoConnections.Remove(connection);
        return Task.CompletedTask;
    }

    public Task SaveChangesAsync(CancellationToken ct = default) => context.SaveChangesAsync(ct);
}
