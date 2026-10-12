using Identity.Infrastructure;

namespace UnitTests.Identity;

/// <summary>
/// Las reglas que impiden darse más poder del que uno tiene: nadie da ni quita
/// lo que no tiene, nadie toca a alguien de su rango o más, los dueños solo los
/// maneja otro dueño, y nadie se edita sus propias excepciones.
/// </summary>
public class TeamRulesTests
{
    private static MemberAccess Access(string role, IEnumerable<Permission>? perms = null) =>
        new(role, (perms ?? AccessPolicy.Defaults(role)).ToHashSet());

    private static readonly MemberAccess Owner = Access(Roles.Owner);
    private static readonly MemberAccess Admin = Access(Roles.Admin);

    private static HashSet<Permission> Set(params Permission[] p) => [.. p];

    // ---------------------------------------------------------------- asignar roles

    [Fact]
    public void Solo_un_duenio_nombra_duenios()
    {
        Assert.Null(TeamRules.CanAssignRole(Owner, Roles.Owner, AccessPolicy.Defaults(Roles.Owner), Roles.Admin, false));
        Assert.Equal("Members.OwnersOnly",
            TeamRules.CanAssignRole(Admin, Roles.Owner, AccessPolicy.Defaults(Roles.Owner), Roles.Vendedor, false)?.Code);
    }

    [Fact]
    public void Un_rol_que_no_existe_es_un_400()
    {
        var denied = TeamRules.CanAssignRole(Owner, "emperador", Set(), null, false);
        Assert.Equal(("Members.InvalidRole", 400), (denied?.Code, denied?.Status));
    }

    [Fact]
    public void Nadie_asigna_un_rol_que_puede_mas_que_el()
    {
        // Un administrador al que el dueño le sacó la tesorería no puede nombrar
        // a alguien de finanzas: le estaría dando algo que él no tiene.
        var adminSinTesoreria = Access(Roles.Admin, AccessPolicy.Defaults(Roles.Admin).Where(p => p != Permission.FinanceManage));
        Assert.Equal("Members.RoleTooHigh",
            TeamRules.CanAssignRole(adminSinTesoreria, Roles.Finanzas, AccessPolicy.Defaults(Roles.Finanzas), null, false)?.Code);
        Assert.Null(TeamRules.CanAssignRole(adminSinTesoreria, Roles.Vendedor, AccessPolicy.Defaults(Roles.Vendedor), null, false));
    }

    [Fact]
    public void Un_vendedor_que_puede_sumar_gente_no_nombra_administradores()
    {
        var vendedor = Access(Roles.Vendedor, AccessPolicy.Defaults(Roles.Vendedor).Append(Permission.MembersManage));
        Assert.Equal("Members.RoleTooHigh",
            TeamRules.CanAssignRole(vendedor, Roles.Admin, AccessPolicy.Defaults(Roles.Admin), null, false)?.Code);
    }

    [Fact]
    public void Un_administrador_no_toca_a_otro_ni_a_un_duenio_y_el_duenio_toca_a_todos()
    {
        Assert.Equal("Members.RoleTooHigh",
            TeamRules.CanAssignRole(Admin, Roles.Vendedor, AccessPolicy.Defaults(Roles.Vendedor), Roles.Admin, false)?.Code);
        Assert.Equal("Members.OwnersOnly", TeamRules.CanRemove(Admin, Roles.Owner, false)?.Code);
        Assert.Null(TeamRules.CanRemove(Owner, Roles.Owner, false));
        Assert.Null(TeamRules.CanAssignRole(Owner, Roles.Admin, AccessPolicy.Defaults(Roles.Admin), Roles.Owner, false));
    }

    [Fact]
    public void Uno_puede_bajarse_el_rol_e_irse()
    {
        Assert.Null(TeamRules.CanAssignRole(Admin, Roles.Soporte, AccessPolicy.Defaults(Roles.Soporte), Roles.Admin, true));
        Assert.Null(TeamRules.CanRemove(Admin, Roles.Admin, true));
    }

    // ---------------------------------------------------------------- excepciones

    [Fact]
    public void Nadie_se_edita_sus_propias_excepciones()
    {
        Assert.Equal("Members.Self", TeamRules.CanEditMember(Owner, Roles.Owner, true, Set())?.Code);
        Assert.Equal("Members.Self", TeamRules.CanEditMember(Admin, Roles.Admin, true, Set(Permission.CostsRead))?.Code);
    }

    [Fact]
    public void Al_duenio_no_se_le_ponen_excepciones() =>
        Assert.Equal(("Members.OwnerHasAll", 400),
            (TeamRules.CanEditMember(Owner, Roles.Owner, false, Set(Permission.StatsRead)) is { } d ? (d.Code, d.Status) : default));

    [Fact]
    public void Solo_se_da_o_se_quita_lo_que_uno_tiene()
    {
        var adminSinCobros = Access(Roles.Admin, AccessPolicy.Defaults(Roles.Admin).Where(p => p != Permission.PaymentsWrite));
        Assert.Equal("Members.NotYours", TeamRules.CanEditMember(adminSinCobros, Roles.Vendedor, false, Set(Permission.PaymentsWrite))?.Code);
        Assert.Null(TeamRules.CanEditMember(adminSinCobros, Roles.Vendedor, false, Set(Permission.OrdersRefund)));
        Assert.Null(TeamRules.CanEditMember(Owner, Roles.Admin, false, Set(Permission.PaymentsWrite)));
    }

    [Fact]
    public void Lo_que_es_solo_del_duenio_no_se_delega_ni_siquiera_el_duenio()
    {
        Assert.Equal("Members.OwnerOnlyPermission", TeamRules.CanEditMember(Owner, Roles.Admin, false, Set(Permission.TenantAdmin))?.Code);
        Assert.Equal("Members.OwnerOnlyPermission", TeamRules.CanEditRole(Owner, Roles.Admin, Set(Permission.TenantAdmin))?.Code);
    }

    [Fact]
    public void Las_excepciones_respetan_la_jerarquia() =>
        Assert.Equal("Members.RoleTooHigh", TeamRules.CanEditMember(Admin, Roles.Admin, false, Set(Permission.CostsRead))?.Code);

    // ---------------------------------------------------------------- la matriz

    [Fact]
    public void La_columna_del_duenio_no_se_edita() =>
        Assert.Equal("Members.OwnerHasAll", TeamRules.CanEditRole(Owner, Roles.Owner, Set(Permission.StatsRead))?.Code);

    [Fact]
    public void Cada_uno_edita_los_roles_por_debajo_del_suyo()
    {
        Assert.Null(TeamRules.CanEditRole(Owner, Roles.Admin, Set(Permission.CostsRead)));
        Assert.Null(TeamRules.CanEditRole(Admin, Roles.Vendedor, Set(Permission.OrdersRefund)));
        Assert.Equal("Members.RoleTooHigh", TeamRules.CanEditRole(Admin, Roles.Admin, Set(Permission.CostsRead))?.Code);
    }

    [Fact]
    public void Un_rol_que_no_existe_es_un_404() =>
        Assert.Equal(404, TeamRules.CanEditRole(Owner, "emperador", Set())?.Status);
}
