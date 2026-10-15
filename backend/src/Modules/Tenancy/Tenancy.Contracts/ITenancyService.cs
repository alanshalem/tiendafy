namespace Tenancy.Contracts;

/// <summary>
/// Puerta de entrada al módulo para el resto del sistema.
/// El TenancyMiddleware resuelve cada request por Host header con esto.
/// </summary>
public interface ITenancyService
{
    /// <summary>
    /// Resuelve tenant por host: subdominio de la plataforma
    /// (mitienda.plataforma.com) o dominio custom (www.mitienda.com).
    /// Null si no matchea ninguno.
    /// </summary>
    Task<TenantDto?> ResolveByHostAsync(string host, CancellationToken ct = default);

    Task<TenantDto?> GetByIdAsync(Guid tenantId, CancellationToken ct = default);

    /// <summary>
    /// Una página de las tiendas pedidas por id (las de un usuario), ordenadas
    /// por nombre y filtradas por nombre si viene <paramref name="search"/>.
    /// </summary>
    Task<(IReadOnlyList<TenantDto> Items, int Total)> PageByIdsAsync(
        IReadOnlyCollection<Guid> ids, string? search, int skip, int take, CancellationToken ct = default);
}
