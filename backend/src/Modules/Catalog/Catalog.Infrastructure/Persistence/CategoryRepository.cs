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
        Category.InTreeOrder(await context.Set<Category>()
            .AsNoTracking()
            .Where(c => c.TenantId == tenantId)
            .ToListAsync(ct));

    public async Task<int> NextPositionAsync(TenantId tenantId, Guid? parentId, CancellationToken ct = default) =>
        (await context.Set<Category>()
            .Where(c => c.TenantId == tenantId && c.ParentId == parentId)
            .MaxAsync(c => (int?)c.Position, ct) ?? -1) + 1;
}
