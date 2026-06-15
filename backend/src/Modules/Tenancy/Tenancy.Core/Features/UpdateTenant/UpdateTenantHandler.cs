using SharedKernel.Abstractions;
using SharedKernel.Common;
using SharedKernel.Exceptions;
using Tenancy.Contracts;
using Tenancy.Core.Domain;

namespace Tenancy.Core.Features.UpdateTenant;

public sealed record UpdateTenantCommand(Guid Id, string Name, string Subdomain, string? CustomDomain);

public sealed class UpdateTenantHandler(ITenantRepository repository, IUnitOfWork unitOfWork)
{
    public async Task<Result<TenantDto>> UpdateAsync(UpdateTenantCommand command, CancellationToken ct = default)
    {
        var tenant = await repository.GetByIdAsync(command.Id, ct);
        if (tenant is null)
            return Result.Failure<TenantDto>(Error.NotFound("Tenant", command.Id));
        if (tenant.Status == TenantStatus.Canceled)
            return Result.Failure<TenantDto>(Error.Conflict("Tenant.Canceled", "La tienda fue eliminada."));

        // Unicidad (excluyendo la propia tienda).
        if (await repository.NameExistsAsync(command.Name, command.Id, ct))
            return Result.Failure<TenantDto>(Error.Conflict(
                "Tenant.NameTaken", $"Ya existe una tienda llamada '{command.Name.Trim()}'."));
        if (await repository.SubdomainExistsAsync(command.Subdomain, command.Id, ct))
            return Result.Failure<TenantDto>(Error.Conflict(
                "Tenant.SubdomainTaken", $"El subdominio '{command.Subdomain.Trim().ToLowerInvariant()}' ya está en uso."));

        var rename = tenant.Rename(command.Name);
        if (rename.IsFailure) return Result.Failure<TenantDto>(rename.Error);

        var changeSub = tenant.ChangeSubdomain(command.Subdomain);
        if (changeSub.IsFailure) return Result.Failure<TenantDto>(changeSub.Error);

        // Dominio propio: vacío lo quita; con valor lo valida + chequea unicidad.
        if (string.IsNullOrWhiteSpace(command.CustomDomain))
        {
            tenant.RemoveCustomDomain();
        }
        else
        {
            var normalized = command.CustomDomain.Trim().ToLowerInvariant();
            if (await repository.CustomDomainExistsAsync(normalized, command.Id, ct))
                return Result.Failure<TenantDto>(Error.Conflict(
                    "Tenant.CustomDomainTaken", $"El dominio '{normalized}' ya está en uso."));
            try
            {
                tenant.AttachCustomDomain(normalized);
            }
            catch (DomainException ex)
            {
                return Result.Failure<TenantDto>(Error.Validation("Tenant.InvalidCustomDomain", ex.Message));
            }
        }

        await unitOfWork.SaveChangesAsync(ct);
        return tenant.ToDto();
    }

    public Task<Result<TenantDto>> ArchiveAsync(Guid id, CancellationToken ct = default) =>
        MutateAsync(id, t => t.Suspend(), ct);

    public Task<Result<TenantDto>> ActivateAsync(Guid id, CancellationToken ct = default) =>
        MutateAsync(id, t => t.Reactivate(), ct);

    public Task<Result<TenantDto>> DeleteAsync(Guid id, CancellationToken ct = default) =>
        MutateAsync(id, t => t.Cancel(), ct);

    private async Task<Result<TenantDto>> MutateAsync(Guid id, Action<Tenant> mutate, CancellationToken ct)
    {
        var tenant = await repository.GetByIdAsync(id, ct);
        if (tenant is null)
            return Result.Failure<TenantDto>(Error.NotFound("Tenant", id));

        try
        {
            mutate(tenant);
        }
        catch (DomainException ex)
        {
            return Result.Failure<TenantDto>(Error.Conflict("Tenant.InvalidTransition", ex.Message));
        }

        await unitOfWork.SaveChangesAsync(ct);
        return tenant.ToDto();
    }
}
