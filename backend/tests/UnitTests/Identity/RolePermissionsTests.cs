using Identity.Infrastructure;

namespace UnitTests.Identity;

/// <summary>La matriz RBAC es política de producto: estos tests la fijan
/// (docs/rbac-propuesta.md). Cambiarla exige cambiar el test a conciencia.</summary>
public class RolePermissionsTests
{
    [Fact]
    public void Owner_HasEverything()
    {
        foreach (var p in Enum.GetValues<Permission>())
            Assert.True(RolePermissions.Has("owner", p), $"owner debería tener {p}");
    }

    [Fact]
    public void Admin_HasEverythingExceptTenantAdmin()
    {
        Assert.False(RolePermissions.Has("admin", Permission.TenantAdmin));
        foreach (var p in Enum.GetValues<Permission>().Where(p => p != Permission.TenantAdmin))
            Assert.True(RolePermissions.Has("admin", p), $"admin debería tener {p}");
    }

    [Fact]
    public void LegacyStaff_MapsToAdmin()
    {
        Assert.True(RolePermissions.Has("staff", Permission.OrdersRefund));
        Assert.False(RolePermissions.Has("staff", Permission.TenantAdmin));
    }

    [Theory]
    // vendedor: órdenes + clientes + chat, sin refunds ni config
    [InlineData("vendedor", Permission.OrdersRead, true)]
    [InlineData("vendedor", Permission.OrdersFulfill, true)]
    [InlineData("vendedor", Permission.OrdersRefund, false)]
    [InlineData("vendedor", Permission.SupportChat, true)]
    [InlineData("vendedor", Permission.CatalogWrite, false)]
    [InlineData("vendedor", Permission.SettingsWrite, false)]
    [InlineData("vendedor", Permission.PaymentsConfigWrite, false)]
    [InlineData("vendedor", Permission.StatsRead, true)]
    // catalogo: productos/inventario/media, nada de ventas
    [InlineData("catalogo", Permission.CatalogWrite, true)]
    [InlineData("catalogo", Permission.InventoryWrite, true)]
    [InlineData("catalogo", Permission.OrdersRead, false)]
    [InlineData("catalogo", Permission.CustomersRead, false)]
    [InlineData("catalogo", Permission.StatsRead, false)]
    // finanzas: solo lectura + refunds
    [InlineData("finanzas", Permission.OrdersRead, true)]
    [InlineData("finanzas", Permission.OrdersRefund, true)]
    [InlineData("finanzas", Permission.OrdersFulfill, false)]
    [InlineData("finanzas", Permission.PaymentsConfigRead, true)]
    [InlineData("finanzas", Permission.PaymentsConfigWrite, false)]
    [InlineData("finanzas", Permission.CatalogWrite, false)]
    // soporte: chat + mensajes + lectura de órdenes
    [InlineData("soporte", Permission.SupportChat, true)]
    [InlineData("soporte", Permission.MessagesRead, true)]
    [InlineData("soporte", Permission.OrdersRead, true)]
    [InlineData("soporte", Permission.OrdersFulfill, false)]
    [InlineData("soporte", Permission.OrdersRefund, false)]
    [InlineData("soporte", Permission.StatsRead, false)]
    public void Matrix_MatchesProposal(string role, Permission permission, bool expected) =>
        Assert.Equal(expected, RolePermissions.Has(role, permission));

    [Fact]
    public void UnknownRole_HasNothing()
    {
        Assert.False(RolePermissions.Has("hacker", Permission.OrdersRead));
        Assert.False(RolePermissions.Has(null, Permission.OrdersRead));
        Assert.Empty(RolePermissions.For("hacker"));
    }

    [Theory]
    [InlineData("owner", 3)]
    [InlineData("admin", 2)]
    [InlineData("staff", 2)]
    [InlineData("vendedor", 1)]
    [InlineData("catalogo", 1)]
    [InlineData("finanzas", 1)]
    [InlineData("soporte", 1)]
    [InlineData("desconocido", 0)]
    public void Rank_Hierarchy(string role, int expected) =>
        Assert.Equal(expected, RolePermissions.Rank(role));

    [Fact]
    public void MembersManage_OnlyOwnerAndAdmin()
    {
        Assert.True(RolePermissions.Has("owner", Permission.MembersManage));
        Assert.True(RolePermissions.Has("admin", Permission.MembersManage));
        foreach (var r in new[] { "vendedor", "catalogo", "finanzas", "soporte" })
            Assert.False(RolePermissions.Has(r, Permission.MembersManage), $"{r} no debe gestionar usuarios");
    }
}
