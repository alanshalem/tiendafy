using SharedKernel.Exceptions;
using Tenancy.Contracts.Events;
using Tenancy.Core.Domain;

namespace UnitTests.Tenancy;

public class TenantTests
{
    private static Tenant CreateValid() => Tenant.Create("Mi Tienda", "mitienda").Value;

    [Fact]
    public void Create_WithValidData_StartsActiveOnFreePlan()
    {
        var tenant = CreateValid();

        Assert.Equal(TenantStatus.Active, tenant.Status);
        Assert.Equal(PlanTier.Free, tenant.Plan);
        Assert.Equal(tenant.Id, tenant.TenantId.Value); // tenant es su propio tenant
    }

    [Fact]
    public void Create_RaisesTenantCreatedEvent()
    {
        var tenant = CreateValid();

        var created = Assert.Single(tenant.DomainEvents.OfType<TenantCreatedEvent>());
        Assert.Equal(tenant.Id, created.TenantId);
        Assert.Equal("mitienda", created.Subdomain);
    }

    [Theory]
    [InlineData("")]
    [InlineData("a")]
    public void Create_WithInvalidName_Fails(string name)
    {
        var result = Tenant.Create(name, "mitienda");

        Assert.True(result.IsFailure);
        Assert.Equal("Tenant.InvalidName", result.Error.Code);
    }

    [Fact]
    public void AttachCustomDomain_NormalizesValue()
    {
        var tenant = CreateValid();

        tenant.AttachCustomDomain("  WWW.MiTienda.COM  ");

        Assert.Equal("www.mitienda.com", tenant.CustomDomain);
    }

    [Theory]
    [InlineData("no-dots")]
    [InlineData("a.b")] // muy corto
    public void AttachCustomDomain_WithInvalidValue_Throws(string domain)
    {
        var tenant = CreateValid();

        Assert.Throws<DomainException>(() => tenant.AttachCustomDomain(domain));
    }

    [Fact]
    public void Suspend_ThenReactivate_RestoresActive()
    {
        var tenant = CreateValid();

        tenant.Suspend();
        Assert.Equal(TenantStatus.Suspended, tenant.Status);

        tenant.Reactivate();
        Assert.Equal(TenantStatus.Active, tenant.Status);
    }

    [Fact]
    public void CanceledTenant_RejectsModifications()
    {
        var tenant = CreateValid();
        tenant.Cancel();

        Assert.Throws<DomainException>(() => tenant.ChangePlan(PlanTier.Pro));
        Assert.Throws<DomainException>(() => tenant.Suspend());
        Assert.Throws<DomainException>(() => tenant.AttachCustomDomain("www.tienda.com"));
    }
}
