using SharedKernel.Abstractions;
using SharedKernel.Common;
using Tenancy.Contracts;
using Tenancy.Core.Domain;

namespace Tenancy.Core.Features.CreateTenant;

public sealed class CreateTenantHandler(ITenantRepository repository, IUnitOfWork unitOfWork)
{
    public async Task<Result<TenantDto>> HandleAsync(CreateTenantCommand command, CancellationToken ct = default)
    {
        var tenantResult = Tenant.Create(command.Name, command.Subdomain);
        if (tenantResult.IsFailure)
            return Result.Failure<TenantDto>(tenantResult.Error);

        var tenant = tenantResult.Value;

        // Chequeo de unicidad pre-insert para error amable. El índice único
        // de la DB es la garantía real contra la race (en subdominio).
        if (await repository.SubdomainExistsAsync(tenant.Subdomain.Value, null, ct))
            return Result.Failure<TenantDto>(Error.Conflict(
                "Tenant.SubdomainTaken", $"El subdominio '{tenant.Subdomain.Value}' ya está en uso."));

        if (await repository.NameExistsAsync(tenant.Name, null, ct))
            return Result.Failure<TenantDto>(Error.Conflict(
                "Tenant.NameTaken", $"Ya existe una tienda llamada '{tenant.Name}'."));

        await repository.AddAsync(tenant, ct);
        await unitOfWork.SaveChangesAsync(ct);

        return tenant.ToDto();
    }
}
