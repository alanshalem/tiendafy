using Checkout.Core.Domain;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Common;

namespace Checkout.Infrastructure.Persistence;

public sealed class CheckoutRepository(CheckoutDbContext context) : ICheckoutRepository
{
    public Task<CheckoutSession?> GetByIdAsync(TenantId tenantId, Guid id, CancellationToken ct = default) =>
        context.Sessions.FirstOrDefaultAsync(s => s.TenantId == tenantId && s.Id == id, ct);

    public async Task AddAsync(CheckoutSession session, CancellationToken ct = default) =>
        await context.Sessions.AddAsync(session, ct);

    public Task SaveChangesAsync(CancellationToken ct = default) =>
        context.SaveChangesAsync(ct);
}
