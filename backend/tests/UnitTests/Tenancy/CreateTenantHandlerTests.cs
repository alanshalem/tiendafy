using Tenancy.Core.Domain;
using Tenancy.Core.Features.CreateTenant;

namespace UnitTests.Tenancy;

public class CreateTenantHandlerTests
{
    private readonly FakeTenantRepository _repository = new();
    private readonly FakeUnitOfWork _unitOfWork = new();

    private CreateTenantHandler Handler => new(_repository, _unitOfWork);

    [Fact]
    public async Task Handle_WithValidCommand_CreatesAndPersists()
    {
        var result = await Handler.HandleAsync(new CreateTenantCommand("Mi Tienda", "mitienda"));

        Assert.True(result.IsSuccess);
        Assert.Equal("mitienda", result.Value.Subdomain);
        Assert.Equal("ACTIVE", result.Value.Status);
        Assert.Equal(1, _unitOfWork.SaveCount);
        Assert.NotNull(await _repository.GetBySubdomainAsync("mitienda"));
    }

    [Fact]
    public async Task Handle_WithTakenSubdomain_FailsWithConflict()
    {
        _repository.Seed(Tenant.Create("Otra", "mitienda").Value);

        var result = await Handler.HandleAsync(new CreateTenantCommand("Mi Tienda", "mitienda"));

        Assert.True(result.IsFailure);
        Assert.Equal("Tenant.SubdomainTaken", result.Error.Code);
        Assert.Equal(0, _unitOfWork.SaveCount);
    }

    [Fact]
    public async Task Handle_WithInvalidSubdomain_FailsWithoutTouchingRepository()
    {
        var result = await Handler.HandleAsync(new CreateTenantCommand("Mi Tienda", "x"));

        Assert.True(result.IsFailure);
        Assert.Equal("Subdomain.Invalid", result.Error.Code);
        Assert.Equal(0, _unitOfWork.SaveCount);
    }
}
