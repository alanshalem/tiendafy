using Catalog.Core.Domain;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Common;

namespace Catalog.Infrastructure.Persistence;

public sealed class CategoryRepository(CatalogDbContext context) : ICategoryRepository
{
    public Task<Category?> GetByIdAsync(TenantId tenantId, Guid id, CancellationToken ct = default) =>
        context.Set<Category>().FirstOrDefaultAsync(c => c.TenantId == tenantId && c.Id == id, ct);

    public Task<bool> PathExistsAsync(TenantId tenantId, string path, CancellationToken ct = default) =>
        context.Set<Category>().AnyAsync(c => c.TenantId == tenantId && c.Path == path, ct);

    public async Task AddAsync(Category category, CancellationToken ct = default) =>
        await context.Set<Category>().AddAsync(category, ct);

    public async Task<IReadOnlyList<Category>> ListAsync(TenantId tenantId, CancellationToken ct = default) =>
        await context.Set<Category>()
            .AsNoTracking()
            .Where(c => c.TenantId == tenantId)
            .OrderBy(c => c.Path)
            .ToListAsync(ct);
}
