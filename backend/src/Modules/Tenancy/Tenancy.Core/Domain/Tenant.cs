using SharedKernel.Common;
using SharedKernel.Domain;
using SharedKernel.Exceptions;
using Tenancy.Contracts.Events;

namespace Tenancy.Core.Domain;

/// <summary>
/// El merchant y su tienda. Caso especial de multi-tenancy: el TenantId
/// del aggregate es su propio Id.
/// </summary>
public sealed class Tenant : AggregateRoot
{
    public string Name { get; private set; } = null!;
    public Subdomain Subdomain { get; private set; } = null!;
    public string? CustomDomain { get; private set; }
    public TenantStatus Status { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }

    private Tenant() { } // EF Core

    private Tenant(Guid id, string name, Subdomain subdomain)
        : base(id, TenantId.From(id))
    {
        Name = name;
        Subdomain = subdomain;
        Status = TenantStatus.Active;
        CreatedAtUtc = DateTime.UtcNow;
    }

    public static Result<Tenant> Create(string? name, string? subdomainRaw)
    {
        var trimmedName = name?.Trim() ?? string.Empty;
        if (trimmedName.Length is < 2 or > 100)
            return Result.Failure<Tenant>(Error.Validation(
                "Tenant.InvalidName", "El nombre tiene que tener entre 2 y 100 caracteres."));

        var subdomainResult = Subdomain.Create(subdomainRaw);
        if (subdomainResult.IsFailure)
            return Result.Failure<Tenant>(subdomainResult.Error);

        var tenant = new Tenant(Guid.NewGuid(), trimmedName, subdomainResult.Value);
        tenant.RaiseDomainEvent(new TenantCreatedEvent(
            tenant.Id, tenant.Name, tenant.Subdomain.Value));

        return tenant;
    }

    public Result Rename(string? name)
    {
        EnsureNotCanceled();
        var trimmed = name?.Trim() ?? string.Empty;
        if (trimmed.Length is < 2 or > 100)
            return Result.Failure(Error.Validation(
                "Tenant.InvalidName", "El nombre tiene que tener entre 2 y 100 caracteres."));
        Name = trimmed;
        return Result.Success();
    }

    /// <summary>
    /// Cambia el subdominio. OJO: es la clave de ruteo del storefront — al
    /// cambiarlo, la URL vieja deja de resolver. El admin sigue andando (usa id).
    /// </summary>
    public Result ChangeSubdomain(string? raw)
    {
        EnsureNotCanceled();
        var result = Subdomain.Create(raw);
        if (result.IsFailure)
            return Result.Failure(result.Error);
        Subdomain = result.Value;
        return Result.Success();
    }

    public void AttachCustomDomain(string domain)
    {
        EnsureNotCanceled();
        var normalized = domain.Trim().ToLowerInvariant();
        if (normalized.Length is < 4 or > 253 || !normalized.Contains('.'))
            throw new DomainException($"'{domain}' is not a valid custom domain.");
        CustomDomain = normalized;
    }

    public void RemoveCustomDomain() => CustomDomain = null;

    public void Suspend()
    {
        EnsureNotCanceled();
        Status = TenantStatus.Suspended;
    }

    public void Reactivate()
    {
        EnsureNotCanceled();
        Status = TenantStatus.Active;
    }

    public void Cancel() => Status = TenantStatus.Canceled;

    private void EnsureNotCanceled()
    {
        if (Status == TenantStatus.Canceled)
            throw new DomainException("Canceled tenants cannot be modified.");
    }
}
