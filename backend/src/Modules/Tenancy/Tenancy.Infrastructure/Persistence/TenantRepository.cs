using Microsoft.EntityFrameworkCore;
using Tenancy.Core.Domain;

namespace Tenancy.Infrastructure.Persistence;

public sealed class TenantRepository(TenancyDbContext context) : ITenantRepository
{
    public Task<Tenant?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        context.Tenants.FirstOrDefaultAsync(t => t.Id == id, ct);

    public Task<Tenant?> GetBySubdomainAsync(string subdomain, CancellationToken ct = default)
    {
        var parsed = Subdomain.Create(subdomain);
        if (parsed.IsFailure)
            return Task.FromResult<Tenant?>(null);

        // Preferimos la tienda viva: puede haber canceladas con el mismo
        // subdominio (eliminadas) además de la activa que lo reclamó.
        return context.Tenants
            .Where(t => t.Subdomain == parsed.Value)
            .OrderBy(t => t.Status == TenantStatus.Canceled ? 1 : 0)
            .FirstOrDefaultAsync(ct);
    }

    public Task<Tenant?> GetByCustomDomainAsync(string domain, CancellationToken ct = default) =>
        context.Tenants.FirstOrDefaultAsync(t => t.CustomDomain == domain, ct);

    public Task<bool> SubdomainExistsAsync(string subdomain, Guid? excludeId = null, CancellationToken ct = default)
    {
        var parsed = Subdomain.Create(subdomain);
        if (parsed.IsFailure)
            return Task.FromResult(false);

        return context.Tenants.AnyAsync(
            t => t.Status != TenantStatus.Canceled
                && t.Subdomain == parsed.Value
                && (excludeId == null || t.Id != excludeId), ct);
    }

    public Task<bool> NameExistsAsync(string name, Guid? excludeId = null, CancellationToken ct = default)
    {
        var normalized = (name ?? string.Empty).Trim().ToLower();
        return context.Tenants.AnyAsync(
            t => t.Status != TenantStatus.Canceled
                && t.Name.ToLower() == normalized
                && (excludeId == null || t.Id != excludeId), ct);
    }

    public Task<bool> CustomDomainExistsAsync(string domain, Guid? excludeId = null, CancellationToken ct = default)
    {
        var normalized = (domain ?? string.Empty).Trim().ToLowerInvariant();
        return context.Tenants.AnyAsync(
            t => t.CustomDomain == normalized && (excludeId == null || t.Id != excludeId), ct);
    }

    public async Task AddAsync(Tenant tenant, CancellationToken ct = default) =>
        await context.Tenants.AddAsync(tenant, ct);

    public async Task<IReadOnlyList<Tenant>> ListAsync(int limit, Guid? afterId, CancellationToken ct = default)
    {
        // Las canceladas (borradas) no se listan.
        var query = context.Tenants.AsNoTracking()
            .Where(t => t.Status != TenantStatus.Canceled)
            .OrderBy(t => t.Id)
            .AsQueryable();
        if (afterId.HasValue)
            query = query.Where(t => t.Id.CompareTo(afterId.Value) > 0);

        return await query.Take(limit).ToListAsync(ct);
    }
}
