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
}
