using Microsoft.EntityFrameworkCore;
using Payments.Core.Domain;
using SharedKernel.Common;

namespace Payments.Infrastructure.Persistence;

public sealed class MercadoPagoConnectionRepository(PaymentsDbContext context) : IMercadoPagoConnectionRepository
{
    public Task<MercadoPagoConnection?> GetByTenantAsync(TenantId tenantId, CancellationToken ct = default) =>
        context.MercadoPagoConnections.FirstOrDefaultAsync(c => c.TenantId == tenantId, ct);

    // Cross-tenant a propósito: el webhook worker resuelve el seller por el
    // user_id de MercadoPago (no tiene contexto de tenant). Ignora el filtro global.
    public Task<MercadoPagoConnection?> GetByMercadoPagoUserIdAsync(long mercadoPagoUserId, CancellationToken ct = default) =>
        context.MercadoPagoConnections.IgnoreQueryFilters().FirstOrDefaultAsync(c => c.MercadoPagoUserId == mercadoPagoUserId, ct);

    public async Task AddAsync(MercadoPagoConnection connection, CancellationToken ct = default) =>
        await context.MercadoPagoConnections.AddAsync(connection, ct);

    public Task RemoveAsync(MercadoPagoConnection connection, CancellationToken ct = default)
    {
        context.MercadoPagoConnections.Remove(connection);
        return Task.CompletedTask;
    }

    public Task SaveChangesAsync(CancellationToken ct = default) => context.SaveChangesAsync(ct);
}
