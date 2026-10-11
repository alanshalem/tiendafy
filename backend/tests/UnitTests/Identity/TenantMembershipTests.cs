using Identity.Infrastructure;

namespace UnitTests.Identity;

/// <summary>
/// El rol que se guarda es el que se pidió. Regresión: la normalización quedó
/// de cuando había dos roles y convertía cualquier rol que no fuera "staff" en
/// "owner" — cada persona sumada al equipo entraba como dueña de la tienda.
/// </summary>
public class TenantMembershipTests
{
    public static TheoryData<string> Roles() => new(RolePermissions.AssignableRoles.Append(RolePermissions.LegacyStaff));

    [Theory]
    [MemberData(nameof(Roles))]
    public void Guarda_el_rol_pedido(string role)
    {
        var membership = TenantMembership.Create(Guid.NewGuid(), Guid.NewGuid(), role);
        Assert.Equal(role, membership.Role);
        Assert.Equal(role == RolePermissions.Owner, membership.IsOwner);
    }

    [Fact]
    public void Sin_rol_es_duenio()
    {
        // El alta de una tienda crea la membresía de quien la crea.
        Assert.True(TenantMembership.Create(Guid.NewGuid(), Guid.NewGuid()).IsOwner);
    }

    [Fact]
    public void Cambiar_de_rol_normaliza_mayusculas_y_espacios()
    {
        var membership = TenantMembership.Create(Guid.NewGuid(), Guid.NewGuid());
        membership.ChangeRole(" Vendedor ");
        Assert.Equal("vendedor", membership.Role);
        Assert.False(membership.IsOwner);
    }

    [Theory]
    [InlineData("emperador")]
    [InlineData("")]
    public void Un_rol_inexistente_no_se_guarda(string role) =>
        Assert.Throws<ArgumentOutOfRangeException>(() => TenantMembership.Create(Guid.NewGuid(), Guid.NewGuid(), role));
}
