using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;
using SharedKernel.Common;

namespace Orders.Infrastructure.Persistence;

public sealed class OrderRepository(OrdersDbContext context) : IOrderRepository
{
    public Task<Order?> GetByIdAsync(TenantId tenantId, Guid id, CancellationToken ct = default) =>
        context.Orders.FirstOrDefaultAsync(o => o.TenantId == tenantId && o.Id == id, ct);

    // Cross-tenant a propósito (settle del webhook, cuyo orderId ya viene de un
    // evento con firma validada). Ignora el filtro global explícitamente.
    public Task<Order?> GetByIdAnyTenantAsync(Guid id, CancellationToken ct = default) =>
        context.Orders.IgnoreQueryFilters().FirstOrDefaultAsync(o => o.Id == id, ct);

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
            var after = await context.Orders.FirstOrDefaultAsync(o => o.TenantId == tenantId && o.Id == afterId.Value, ct);
            if (after is not null)
                query = query.Where(o => o.CreatedAtUtc < after.CreatedAtUtc);
        }
        return await query.Take(limit).ToListAsync(ct);
    }

    public async Task<(IReadOnlyList<Order> Items, int Total)> ListPageAsync(
        TenantId tenantId, int limit, int offset, string? search, string? status, CancellationToken ct = default)
    {
        var query = context.Orders.Where(o => o.TenantId == tenantId);

        if (!string.IsNullOrWhiteSpace(status))
        {
            var wanted = status.Trim().ToUpperInvariant();
            query = query.Where(o => o.Status.ToString().ToUpper() == wanted);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = $"%{search.Trim()}%";
            // Email, nombre del comprador o el principio del id (lo que se ve
            // en la tabla como número de orden).
            query = query.Where(o =>
                EF.Functions.ILike(o.BuyerEmail, term)
                || (o.BuyerName != null && EF.Functions.ILike(o.BuyerName, term))
                || EF.Functions.ILike(o.Id.ToString(), term));
        }

        var total = await query.CountAsync(ct);
        var items = await query
            .OrderByDescending(o => o.CreatedAtUtc)
            .Skip(offset)
            .Take(limit)
            .ToListAsync(ct);
        return (items, total);
    }

    public async Task AddAsync(Order order, CancellationToken ct = default) =>
        await context.Orders.AddAsync(order, ct);

    public Task SaveChangesAsync(CancellationToken ct = default) => context.SaveChangesAsync(ct);
}
