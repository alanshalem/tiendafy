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
    public async Task ResolveByHost_BaseDomainClaimedByTenant_ResolvesIt()
    {
        // El dominio raiz de la plataforma puede ser la tienda de una empresa:
        // la importadora que opera la instalacion vende desde ahi. Si lo
        // reclamo como dominio propio, resuelve a esa tienda y no a la landing.
        var tenant = Tenant.Create("Puente Oriente", "puenteoriente").Value;
        tenant.AttachCustomDomain("tiendafy.com");
        _repository.Seed(tenant);

        var dto = await _service.ResolveByHostAsync("tiendafy.com");

        Assert.NotNull(dto);
        Assert.Equal("puenteoriente", dto.Subdomain);
    }

    [Fact]
    public async Task ResolveByHost_WwwLlegaALaMismaTienda_EnLosDosSentidos()
    {
        // El comercio carga un dominio y la gente escribe el otro. Las dos
        // formas tienen que llegar a la tienda, no a "tienda no encontrada".
        var sinWww = Tenant.Create("Volxen", "volxen").Value;
        sinWww.AttachCustomDomain("volxen.com.ar");
        _repository.Seed(sinWww);

        Assert.NotNull(await _service.ResolveByHostAsync("volxen.com.ar"));
        Assert.NotNull(await _service.ResolveByHostAsync("www.volxen.com.ar"));

        var conWww = Tenant.Create("Canicari", "canicari").Value;
        conWww.AttachCustomDomain("www.canicari.com.ar");
        _repository.Seed(conWww);

        Assert.NotNull(await _service.ResolveByHostAsync("www.canicari.com.ar"));
        Assert.NotNull(await _service.ResolveByHostAsync("canicari.com.ar"));
    }

    [Fact]
    public async Task ResolveByHost_CanceledTenant_ResolvesWithCanceledStatus()
    {
        var tenant = Tenant.Create("Mi Tienda", "mitienda").Value;
        tenant.Cancel();
        _repository.Seed(tenant);

        // Cancelada resuelve: el storefront muestra "tienda eliminada"
        // (page.tsx trata Status=CANCELED). Null queda sólo para hosts
        // que nunca existieron.
        var dto = await _service.ResolveByHostAsync("mitienda.tiendafy.com");
        Assert.NotNull(dto);
        Assert.Equal("CANCELED", dto.Status);
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
