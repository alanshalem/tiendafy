namespace Tenancy.Core.Domain;

/// <summary>
/// Puerto de persistencia del módulo. Implementación EF Core en
/// Tenancy.Infrastructure.
/// </summary>
public interface ITenantRepository
{
    Task<Tenant?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<Tenant?> GetBySubdomainAsync(string subdomain, CancellationToken ct = default);
    Task<Tenant?> GetByCustomDomainAsync(string domain, CancellationToken ct = default);

    /// <summary>¿Ya hay otra tienda con ese subdominio? (excluye una por id, p/ updates).</summary>
    Task<bool> SubdomainExistsAsync(string subdomain, Guid? excludeId = null, CancellationToken ct = default);
    /// <summary>¿Ya hay otra tienda con ese nombre? (case-insensitive, excluye canceladas).</summary>
    Task<bool> NameExistsAsync(string name, Guid? excludeId = null, CancellationToken ct = default);
    /// <summary>¿Ya hay otra tienda con ese dominio propio?</summary>
    Task<bool> CustomDomainExistsAsync(string domain, Guid? excludeId = null, CancellationToken ct = default);

    Task AddAsync(Tenant tenant, CancellationToken ct = default);
    Task<IReadOnlyList<Tenant>> ListAsync(int limit, Guid? afterId, CancellationToken ct = default);

    /// <summary>
    /// Una página de las tiendas pedidas (las de un usuario), por nombre, con
    /// búsqueda opcional por nombre, y cuántas hay en total.
    /// </summary>
    Task<(IReadOnlyList<Tenant> Items, int Total)> PageByIdsAsync(
        IReadOnlyCollection<Guid> ids, string? search, int skip, int take, CancellationToken ct = default);
}
