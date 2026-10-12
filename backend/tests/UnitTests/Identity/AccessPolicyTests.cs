using System.Text.RegularExpressions;
using Identity.Infrastructure;

namespace UnitTests.Identity;

/// <summary>
/// Cómo se calcula lo que puede cada quien: lo que trae el rol de fábrica, lo
/// que la tienda le cambió a ese rol y las excepciones de la persona. Lo de
/// fábrica es política de producto: cambiarlo exige cambiar estos tests a conciencia.
/// </summary>
public class AccessPolicyTests
{
    private static readonly IReadOnlySet<Permission> Everything = Enum.GetValues<Permission>().ToHashSet();

    private static PermissionOverride Give(Permission p) => new(PermissionCatalog.Key(p), true);
    private static PermissionOverride Take(Permission p) => new(PermissionCatalog.Key(p), false);

    // ---------------------------------------------------------------- catálogo

    [Fact]
    public void Cada_permiso_esta_en_el_catalogo_una_sola_vez_y_con_su_texto()
    {
        Assert.Equal(Everything.OrderBy(p => p), PermissionCatalog.All.Select(p => p.Id).OrderBy(p => p));
        Assert.Equal(PermissionCatalog.All.Count, PermissionCatalog.All.Select(p => p.Key).Distinct().Count());
        foreach (var p in PermissionCatalog.All)
        {
            Assert.Matches(new Regex("^[a-z]+\\.[a-z]+$"), p.Key);
            Assert.False(string.IsNullOrWhiteSpace(p.Label), p.Key);
            Assert.False(string.IsNullOrWhiteSpace(p.Description), p.Key);
            Assert.Contains(p.Group, PermissionCatalog.Groups);
            Assert.All(p.DefaultRoles, r => Assert.True(Roles.Exists(r) && r != Roles.Owner, $"{p.Key}: rol {r}"));
        }
    }

    [Fact]
    public void Los_requisitos_son_de_un_solo_nivel_y_lo_de_fabrica_los_respeta()
    {
        foreach (var p in PermissionCatalog.All.Where(p => p.Requires is not null))
            Assert.Null(PermissionCatalog.Info(p.Requires!.Value).Requires);

        // Si un rol trajera de fábrica algo sin su requisito, la matriz mostraría
        // un permiso que el panel no deja usar.
        foreach (var role in Roles.All)
            Assert.Equal(AccessPolicy.Defaults(role.Key).OrderBy(p => p), AccessPolicy.Normalize(AccessPolicy.Defaults(role.Key)).OrderBy(p => p));
    }

    [Fact]
    public void Las_claves_van_y_vuelven()
    {
        foreach (var p in Everything)
            Assert.Equal(p, PermissionCatalog.FromKey(PermissionCatalog.Key(p)));
        Assert.Null(PermissionCatalog.FromKey("permiso.inventado"));
        Assert.Null(PermissionCatalog.FromKey(null));
    }

    // ---------------------------------------------------------------- de fábrica

    [Fact]
    public void El_duenio_puede_todo_y_nada_se_lo_quita()
    {
        Assert.Equal(Everything, AccessPolicy.Defaults(Roles.Owner));
        var revoked = Everything.Select(Take).ToList();
        Assert.Equal(Everything, AccessPolicy.ForMember(Roles.Owner, revoked, revoked));
    }

    [Fact]
    public void El_administrador_puede_todo_menos_lo_que_es_solo_del_duenio()
    {
        var admin = AccessPolicy.Defaults(Roles.Admin);
        Assert.Equal(Everything.Where(p => !PermissionCatalog.Info(p).OwnerOnly).OrderBy(p => p), admin.OrderBy(p => p));
        Assert.DoesNotContain(Permission.TenantAdmin, admin);
    }

    [Theory]
    // vendedor: vende, despacha y atiende; no devuelve plata ni ve márgenes ni configura
    [InlineData(Roles.Vendedor, Permission.OrdersRead, true)]
    [InlineData(Roles.Vendedor, Permission.OrdersCreate, true)]
    [InlineData(Roles.Vendedor, Permission.OrdersFulfill, true)]
    [InlineData(Roles.Vendedor, Permission.QuotesManage, true)]
    [InlineData(Roles.Vendedor, Permission.MeliOperate, true)]
    [InlineData(Roles.Vendedor, Permission.OrdersRefund, false)]
    [InlineData(Roles.Vendedor, Permission.CostsRead, false)]
    [InlineData(Roles.Vendedor, Permission.CatalogWrite, false)]
    [InlineData(Roles.Vendedor, Permission.StoreConfig, false)]
    // catálogo: productos, precios, stock y publicaciones; nada de ventas ni clientes
    [InlineData(Roles.Catalogo, Permission.CatalogWrite, true)]
    [InlineData(Roles.Catalogo, Permission.PricesManage, true)]
    [InlineData(Roles.Catalogo, Permission.InventoryWrite, true)]
    [InlineData(Roles.Catalogo, Permission.MeliPublish, true)]
    [InlineData(Roles.Catalogo, Permission.CostsRead, true)]
    [InlineData(Roles.Catalogo, Permission.OrdersRead, false)]
    [InlineData(Roles.Catalogo, Permission.CustomersRead, false)]
    // finanzas: cobros, facturación, tesorería y compras; no despacha ni conecta cobros
    [InlineData(Roles.Finanzas, Permission.OrdersRefund, true)]
    [InlineData(Roles.Finanzas, Permission.FinanceManage, true)]
    [InlineData(Roles.Finanzas, Permission.FiscalEmit, true)]
    [InlineData(Roles.Finanzas, Permission.PurchasingManage, true)]
    [InlineData(Roles.Finanzas, Permission.PaymentsRead, true)]
    [InlineData(Roles.Finanzas, Permission.PaymentsWrite, false)]
    [InlineData(Roles.Finanzas, Permission.OrdersFulfill, false)]
    // soporte: posventa, mensajes y preguntas de ML; solo mira las ventas
    [InlineData(Roles.Soporte, Permission.SupportChat, true)]
    [InlineData(Roles.Soporte, Permission.MessagesRead, true)]
    [InlineData(Roles.Soporte, Permission.MeliOperate, true)]
    [InlineData(Roles.Soporte, Permission.OrdersRead, true)]
    [InlineData(Roles.Soporte, Permission.OrdersFulfill, false)]
    [InlineData(Roles.Soporte, Permission.StatsRead, false)]
    public void Lo_que_trae_cada_rol_de_fabrica(string role, Permission permission, bool expected) =>
        Assert.Equal(expected, AccessPolicy.Defaults(role).Contains(permission));

    [Fact]
    public void Gestionar_el_equipo_y_la_matriz_es_del_duenio_y_del_administrador()
    {
        foreach (var role in new[] { Roles.Vendedor, Roles.Catalogo, Roles.Finanzas, Roles.Soporte })
        {
            Assert.DoesNotContain(Permission.MembersManage, AccessPolicy.Defaults(role));
            Assert.DoesNotContain(Permission.RolesManage, AccessPolicy.Defaults(role));
        }
        Assert.Contains(Permission.RolesManage, AccessPolicy.Defaults(Roles.Admin));
    }

    [Fact]
    public void Un_rol_que_no_existe_no_puede_nada() =>
        Assert.Empty(AccessPolicy.Defaults("hacker"));

    // ---------------------------------------------------------------- las tres capas

    [Fact]
    public void La_tienda_le_suma_y_le_quita_a_un_rol()
    {
        var vendedor = AccessPolicy.ForRole(Roles.Vendedor, [Give(Permission.OrdersRefund), Take(Permission.QuotesManage)]);
        Assert.Contains(Permission.OrdersRefund, vendedor);
        Assert.DoesNotContain(Permission.QuotesManage, vendedor);
        Assert.Contains(Permission.OrdersRead, vendedor); // lo que nadie tocó, sigue
    }

    [Fact]
    public void Las_excepciones_de_la_persona_van_encima_de_las_del_rol()
    {
        var roleOverrides = new[] { Give(Permission.OrdersRefund) };
        var member = AccessPolicy.ForMember(Roles.Vendedor, roleOverrides, [Take(Permission.OrdersRefund), Give(Permission.CostsRead)]);
        Assert.DoesNotContain(Permission.OrdersRefund, member);
        Assert.Contains(Permission.CostsRead, member);
    }

    [Fact]
    public void Lo_que_es_solo_del_duenio_no_se_da_por_excepcion_y_lo_inventado_se_ignora()
    {
        var admin = AccessPolicy.ForMember(Roles.Admin, [Give(Permission.TenantAdmin)], [Give(Permission.TenantAdmin), new("permiso.viejo", true)]);
        Assert.DoesNotContain(Permission.TenantAdmin, admin);
        Assert.Equal(AccessPolicy.Defaults(Roles.Admin).Count, admin.Count);
    }

    [Fact]
    public void Sin_su_requisito_un_permiso_no_cuenta()
    {
        // Devolver plata sin poder ver las ventas: no hay desde dónde hacerlo.
        var soporte = AccessPolicy.ForRole(Roles.Soporte, [Give(Permission.OrdersRefund), Take(Permission.OrdersRead)]);
        Assert.DoesNotContain(Permission.OrdersRefund, soporte);
        Assert.DoesNotContain(Permission.OrdersRead, soporte);
    }

    // ---------------------------------------------------------------- lo que se guarda

    [Fact]
    public void Se_guardan_solo_las_diferencias()
    {
        var baseline = AccessPolicy.Defaults(Roles.Vendedor);
        Assert.Empty(AccessPolicy.Diff(baseline, baseline));

        var desired = baseline.Append(Permission.OrdersRefund).Where(p => p != Permission.QuotesManage).ToHashSet();
        var diff = AccessPolicy.Diff(baseline, desired);
        Assert.Equal(2, diff.Count);
        Assert.Contains(Give(Permission.OrdersRefund), diff);
        Assert.Contains(Take(Permission.QuotesManage), diff);
    }

    [Fact]
    public void Guardar_y_releer_da_lo_pedido()
    {
        var desired = new HashSet<Permission> { Permission.OrdersRead, Permission.OrdersRefund, Permission.CostsRead, Permission.TenantAdmin };
        var stored = AccessPolicy.Diff(AccessPolicy.Defaults(Roles.Soporte), desired);
        var reread = AccessPolicy.ForRole(Roles.Soporte, stored);
        Assert.Equal(desired.Where(p => p != Permission.TenantAdmin).OrderBy(p => p), reread.OrderBy(p => p));
    }

    [Fact]
    public void Lo_que_cambia_entre_dos_conjuntos()
    {
        var changed = AccessPolicy.Changed(
            new HashSet<Permission> { Permission.OrdersRead, Permission.StatsRead },
            new HashSet<Permission> { Permission.OrdersRead, Permission.CostsRead });
        Assert.True(changed.SetEquals([Permission.StatsRead, Permission.CostsRead]));
    }
}
