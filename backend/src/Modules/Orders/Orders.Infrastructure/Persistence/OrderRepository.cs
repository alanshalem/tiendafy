using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;
using SharedKernel.Common;

namespace Orders.Infrastructure.Persistence;

public sealed class OrderRepository(OrdersDbContext context) : IOrderRepository
{
    public Task<Order?> GetByIdAsync(TenantId tenantId, Guid id, CancellationToken ct = default) =>
        context.Orders.FirstOrDefaultAsync(o => o.TenantId == tenantId && o.Id == id, ct);

    public Task<Order?> GetByIdAnyTenantAsync(Guid id, CancellationToken ct = default) =>
        context.Orders.FirstOrDefaultAsync(o => o.Id == id, ct);

    public async Task<IReadOnlyList<Order>> ListByBuyerEmailAsync(TenantId tenantId, string email, CancellationToken ct = default)
    {
        var e = email.Trim().ToLowerInvariant();
        return await context.Orders
            .Where(o => o.TenantId == tenantId && o.BuyerEmail.ToLower() == e)
            .OrderByDescending(o => o.CreatedAtUtc)
            .Take(100)
            .ToListAsync(ct);
    }

    public async Task<IReadOnlyList<Order>> ListAsync(TenantId tenantId, int limit, Guid? afterId, CancellationToken ct = default)
    {
        var query = context.Orders.Where(o => o.TenantId == tenantId).OrderByDescending(o => o.CreatedAtUtc).AsQueryable();
        if (afterId.HasValue)
        {
            var after = await context.Orders.FirstOrDefaultAsync(o => o.Id == afterId.Value, ct);
            if (after is not null)
                query = query.Where(o => o.CreatedAtUtc < after.CreatedAtUtc);
        }
        return await query.Take(limit).ToListAsync(ct);
    }

    public async Task AddAsync(Order order, CancellationToken ct = default) =>
        await context.Orders.AddAsync(order, ct);

    public Task SaveChangesAsync(CancellationToken ct = default) => context.SaveChangesAsync(ct);
}
