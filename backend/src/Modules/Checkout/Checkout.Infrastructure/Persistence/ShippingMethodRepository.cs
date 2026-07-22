using Checkout.Core.Domain;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Common;

namespace Checkout.Infrastructure.Persistence;

public sealed class ShippingMethodRepository(CheckoutDbContext context) : IShippingMethodRepository
{
    public Task<ShippingMethod?> GetActiveByIdAsync(TenantId tenantId, Guid id, CancellationToken ct = default) =>
        context.ShippingMethods.FirstOrDefaultAsync(m => m.TenantId == tenantId && m.Id == id && m.Active, ct);

    public Task<ShippingMethod?> GetByIdAsync(TenantId tenantId, Guid id, CancellationToken ct = default) =>
        context.ShippingMethods.FirstOrDefaultAsync(m => m.TenantId == tenantId && m.Id == id, ct);

    public async Task<IReadOnlyList<ShippingMethod>> ListAsync(TenantId tenantId, bool onlyActive, CancellationToken ct = default) =>
        await context.ShippingMethods.AsNoTracking()
            .Where(m => m.TenantId == tenantId && (!onlyActive || m.Active))
            .OrderBy(m => m.SortOrder).ThenBy(m => m.CreatedAtUtc)
            .ToListAsync(ct);

    public async Task AddAsync(ShippingMethod method, CancellationToken ct = default) =>
        await context.ShippingMethods.AddAsync(method, ct);

    public Task RemoveAsync(ShippingMethod method, CancellationToken ct = default)
    {
        context.ShippingMethods.Remove(method);
        return Task.CompletedTask;
    }

    public Task SaveChangesAsync(CancellationToken ct = default) =>
        context.SaveChangesAsync(ct);
}
