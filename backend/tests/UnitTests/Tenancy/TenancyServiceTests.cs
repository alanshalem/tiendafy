using Tenancy.Core.Application;
using Tenancy.Core.Domain;

namespace UnitTests.Tenancy;

public class TenancyServiceTests
{
    private readonly FakeTenantRepository _repository = new();
    private readonly TenancyService _service;

    public TenancyServiceTests()
    {
        _service = new TenancyService(
            _repository,
            new TenancyOptions { PlatformBaseDomain = "tiendafy.com" });
    }

    [Fact]
    public async Task ResolveByHost_PlatformSubdomain_ResolvesTenant()
    {
        _repository.Seed(Tenant.Create("Mi Tienda", "mitienda").Value);

        var dto = await _service.ResolveByHostAsync("mitienda.tiendafy.com");

        Assert.NotNull(dto);
        Assert.Equal("mitienda", dto.Subdomain);
    }

    [Fact]
    public async Task ResolveByHost_IgnoresPortAndCase()
    {
        _repository.Seed(Tenant.Create("Mi Tienda", "mitienda").Value);

        var dto = await _service.ResolveByHostAsync("MiTienda.Tiendafy.COM:3000");

        Assert.NotNull(dto);
    }

    [Fact]
    public async Task ResolveByHost_CustomDomain_ResolvesTenant()
    {
        var tenant = Tenant.Create("Mi Tienda", "mitienda").Value;
        tenant.AttachCustomDomain("www.mitienda.com.ar");
        _repository.Seed(tenant);

        var dto = await _service.ResolveByHostAsync("www.mitienda.com.ar");

        Assert.NotNull(dto);
        Assert.Equal("mitienda", dto.Subdomain);
    }

    [Fact]
    public async Task ResolveByHost_UnknownHost_ReturnsNull()
    {
        Assert.Null(await _service.ResolveByHostAsync("desconocida.tiendafy.com"));
        Assert.Null(await _service.ResolveByHostAsync("www.otracosa.com"));
    }

    [Fact]
    public async Task ResolveByHost_NestedSubdomain_ReturnsNull()
    {
        _repository.Seed(Tenant.Create("Mi Tienda", "mitienda").Value);

        Assert.Null(await _service.ResolveByHostAsync("a.mitienda.tiendafy.com"));
    }

    [Fact]
    public async Task ResolveByHost_BareBaseDomain_ReturnsNull()
    {
        Assert.Null(await _service.ResolveByHostAsync("tiendafy.com"));
    }

    [Fact]
    public async Task ResolveByHost_CanceledTenant_ReturnsNull()
    {
        var tenant = Tenant.Create("Mi Tienda", "mitienda").Value;
        tenant.Cancel();
        _repository.Seed(tenant);

        Assert.Null(await _service.ResolveByHostAsync("mitienda.tiendafy.com"));
    }

    [Fact]
    public async Task ResolveByHost_SuspendedTenant_StillResolves()
    {
        var tenant = Tenant.Create("Mi Tienda", "mitienda").Value;
        tenant.Suspend();
        _repository.Seed(tenant);

        // Suspendido resuelve: el storefront muestra página de suspensión.
        var dto = await _service.ResolveByHostAsync("mitienda.tiendafy.com");
        Assert.NotNull(dto);
        Assert.Equal("SUSPENDED", dto.Status);
    }
}
