using Tenancy.Core.Domain;

namespace UnitTests.Tenancy;

/// <summary>Repo in-memory para tests de handlers/servicio. Sin mocks frágiles.</summary>
public sealed class FakeTenantRepository : ITenantRepository
{
    private readonly List<Tenant> _tenants = [];

    public void Seed(Tenant tenant) => _tenants.Add(tenant);

    public Task<Tenant?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        Task.FromResult(_tenants.FirstOrDefault(t => t.Id == id));

    public Task<Tenant?> GetBySubdomainAsync(string subdomain, CancellationToken ct = default) =>
        Task.FromResult(_tenants.FirstOrDefault(t => t.Subdomain.Value == subdomain));

    public Task<Tenant?> GetByCustomDomainAsync(string domain, CancellationToken ct = default) =>
        Task.FromResult(_tenants.FirstOrDefault(t => t.CustomDomain == domain));

    public Task<bool> SubdomainExistsAsync(string subdomain, Guid? excludeId = null, CancellationToken ct = default) =>
        Task.FromResult(_tenants.Any(t => t.Subdomain.Value == subdomain && t.Id != excludeId));

    public Task<bool> NameExistsAsync(string name, Guid? excludeId = null, CancellationToken ct = default) =>
        Task.FromResult(_tenants.Any(t => t.Name == name && t.Id != excludeId));

    public Task<bool> CustomDomainExistsAsync(string domain, Guid? excludeId = null, CancellationToken ct = default) =>
        Task.FromResult(_tenants.Any(t => t.CustomDomain == domain && t.Id != excludeId));

    public Task AddAsync(Tenant tenant, CancellationToken ct = default)
    {
        _tenants.Add(tenant);
        return Task.CompletedTask;
    }

    public Task<IReadOnlyList<Tenant>> ListAsync(int limit, Guid? afterId, CancellationToken ct = default)
    {
        var ordered = _tenants.OrderBy(t => t.Id).AsEnumerable();
        if (afterId.HasValue)
            ordered = ordered.SkipWhile(t => t.Id != afterId.Value).Skip(1);
        return Task.FromResult<IReadOnlyList<Tenant>>(ordered.Take(limit).ToList());
    }
}

public sealed class FakeUnitOfWork : SharedKernel.Abstractions.IUnitOfWork
{
    public int SaveCount { get; private set; }

    public Task SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        SaveCount++;
        return Task.CompletedTask;
    }
}
