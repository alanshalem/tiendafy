using Tenancy.Contracts;
using Tenancy.Core.Domain;

namespace Tenancy.Core;

/// <summary>Mapping manual (sin AutoMapper, por diseño — ver ADR/patrones).</summary>
public static class TenantMapping
{
    public static TenantDto ToDto(this Tenant tenant) => new(
        tenant.Id,
        tenant.Name,
        tenant.Subdomain.Value,
        tenant.CustomDomain,
        tenant.Status.ToString().ToUpperInvariant(),
        tenant.CreatedAtUtc);
}
