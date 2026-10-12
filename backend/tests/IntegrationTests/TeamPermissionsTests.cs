using System.Net;
using System.Text.Json;

namespace IntegrationTests;

/// <summary>
/// La matriz de permisos editable por tienda, de punta a punta: el dueño cambia
/// lo que puede un rol o una persona, eso decide el próximo request (no el
/// próximo login), las reglas impiden darse más poder del que uno tiene, y
/// todo queda en el registro de actividad.
/// </summary>
[Collection("api")]
public sealed class TeamPermissionsTests(ApiFactory factory)
{
    private const string Roles = "/api/v1/members/roles";

    private static string[] Strings(JsonElement array) => [.. array.EnumerateArray().Select(e => e.GetString()!)];

    private static async Task<string[]> RolePermissionsAsync(Merchant store, string role) =>
        Strings((await store.GetAsync(Roles)).GetProperty("roles").EnumerateArray()
            .Single(r => r.GetProperty("role").GetString() == role).GetProperty("permissions"));

    [Fact]
    public async Task El_catalogo_y_la_matriz_salen_del_backend()
    {
        var store = await Merchant.CreateAsync(factory, "mat");
        var matrix = await store.GetAsync(Roles);

        var permissions = matrix.GetProperty("permissions").EnumerateArray().ToList();
        Assert.Contains(permissions, p => p.GetProperty("key").GetString() == "orders.refund" && p.GetProperty("sensitive").GetBoolean());
        Assert.Contains(permissions, p => p.GetProperty("key").GetString() == "tenant.admin" && p.GetProperty("ownerOnly").GetBoolean());
        Assert.Equal("orders.read", permissions.Single(p => p.GetProperty("key").GetString() == "orders.refund").GetProperty("requires").GetString());
        Assert.Contains("Ventas", Strings(matrix.GetProperty("groups")));

        var roles = matrix.GetProperty("roles").EnumerateArray().ToList();
        Assert.Equal(["owner", "admin", "vendedor", "catalogo", "finanzas", "soporte"], roles.Select(r => r.GetProperty("role").GetString()));
        Assert.Equal(permissions.Count, roles[0].GetProperty("permissions").GetArrayLength()); // el dueño, todo
        Assert.Equal("Vendedor", roles[2].GetProperty("label").GetString());
    }

    [Fact]
    public async Task El_duenio_cambia_lo_que_puede_un_rol_y_vale_en_el_proximo_request()
    {
        var owner = await Merchant.CreateAsync(factory, "rol");
        var seller = await owner.AddTeammateAsync("vendedor");
        Assert.Equal(HttpStatusCode.Forbidden, await seller.StatusAsync(HttpMethod.Get, "/api/v1/finance/accounts"));

        // Al rol Vendedor se le suma la tesorería y se le saca hacer presupuestos.
        var desired = (await RolePermissionsAsync(owner, "vendedor"))
            .Where(p => p != "quotes.manage").Append("finance.manage").ToArray();
        await owner.ExpectOkAsync(HttpMethod.Put, $"{Roles}/vendedor", new { permissions = desired });

        Assert.Contains("finance.manage", await seller.PermissionsAsync());
        Assert.Equal(HttpStatusCode.OK, await seller.StatusAsync(HttpMethod.Get, "/api/v1/finance/accounts"));
        Assert.Equal(HttpStatusCode.Forbidden, await seller.StatusAsync(HttpMethod.Get, "/api/v1/quotes"));

        // La matriz dice qué cambió respecto de fábrica.
        var vendedor = (await owner.GetAsync(Roles)).GetProperty("roles").EnumerateArray().Single(r => r.GetProperty("role").GetString() == "vendedor");
        Assert.Contains("quotes.manage", Strings(vendedor.GetProperty("defaults")));
        Assert.DoesNotContain("quotes.manage", Strings(vendedor.GetProperty("permissions")));

        // Restaurar lo de fábrica.
        await owner.ExpectOkAsync(HttpMethod.Delete, $"{Roles}/vendedor");
        Assert.DoesNotContain("finance.manage", await seller.PermissionsAsync());
        Assert.Equal(HttpStatusCode.OK, await seller.StatusAsync(HttpMethod.Get, "/api/v1/quotes"));

        // Lo que no se puede: la columna del dueño, permisos inventados, lo que es solo del dueño.
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.SendAsync(HttpMethod.Put, $"{Roles}/owner", new { permissions = Array.Empty<string>() })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.SendAsync(HttpMethod.Put, $"{Roles}/vendedor", new { permissions = new[] { "orders.read", "dios.total" } })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.SendAsync(HttpMethod.Put, $"{Roles}/admin", new { permissions = new[] { "tenant.admin" } })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await owner.SendAsync(HttpMethod.Delete, $"{Roles}/emperador")).StatusCode);
    }

    [Fact]
    public async Task Un_permiso_sin_su_requisito_no_se_guarda()
    {
        var owner = await Merchant.CreateAsync(factory, "req");
        // Devolver plata sin poder ver las ventas: se descarta.
        await owner.ExpectOkAsync(HttpMethod.Put, $"{Roles}/catalogo", new { permissions = new[] { "catalog.write", "orders.refund" } });
        Assert.Equal(["catalog.write"], await RolePermissionsAsync(owner, "catalogo"));
    }

    [Fact]
    public async Task Un_administrador_edita_los_roles_de_abajo_y_solo_con_lo_que_tiene()
    {
        var owner = await Merchant.CreateAsync(factory, "adm");
        var admin = await owner.AddTeammateAsync("admin");

        // A su propio rol no llega; al de abajo sí.
        Assert.Equal(HttpStatusCode.Forbidden, await admin.StatusAsync(HttpMethod.Put, $"{Roles}/admin", new { permissions = new[] { "orders.read" } }));
        Assert.Equal(HttpStatusCode.NoContent, await admin.StatusAsync(HttpMethod.Put, $"{Roles}/soporte", new { permissions = new[] { "orders.read", "support.chat", "stats.read" } }));

        // El dueño le saca la tesorería al administrador: ya no la puede repartir.
        var adminPerms = (await RolePermissionsAsync(owner, "admin")).Where(p => p != "finance.manage").ToArray();
        await owner.ExpectOkAsync(HttpMethod.Put, $"{Roles}/admin", new { permissions = adminPerms });
        var denied = await admin.SendAsync(HttpMethod.Put, $"{Roles}/soporte", new { permissions = new[] { "orders.read", "finance.manage" } });
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
        Assert.Contains("vos mismo", await denied.Content.ReadAsStringAsync());

        // Y tampoco puede nombrar a alguien de finanzas (ese rol puede más que él).
        var other = await Merchant.CreateAsync(factory, "adm2");
        Assert.Equal(HttpStatusCode.Forbidden, await admin.StatusAsync(HttpMethod.Post, "/api/v1/members", new { email = other.Email, role = "finanzas" }));

        // Sin el permiso de editar la matriz, nada.
        var seller = await owner.AddTeammateAsync("vendedor");
        Assert.Equal(HttpStatusCode.Forbidden, await seller.StatusAsync(HttpMethod.Put, $"{Roles}/soporte", new { permissions = Array.Empty<string>() }));
    }

    [Fact]
    public async Task Excepciones_de_una_persona_sin_cambiarle_el_rol()
    {
        var owner = await Merchant.CreateAsync(factory, "exc");
        var support = await owner.AddTeammateAsync("soporte");
        var path = $"/api/v1/members/{support.UserId}/permissions";

        // A esta persona de soporte se le suman las estadísticas y se le quitan las ventas.
        var mine = (await support.PermissionsAsync()).Where(p => p != "orders.read").Append("stats.read").ToArray();
        await owner.ExpectOkAsync(HttpMethod.Put, path, new { permissions = mine });
        Assert.Equal(HttpStatusCode.OK, await support.StatusAsync(HttpMethod.Get, "/api/v1/stats/overview"));
        Assert.Equal(HttpStatusCode.Forbidden, await support.StatusAsync(HttpMethod.Get, "/api/v1/orders"));

        var listed = (await owner.GetAsync("/api/v1/members")).GetProperty("items").EnumerateArray().Single(m => m.GetProperty("userId").GetGuid() == support.UserId);
        Assert.True(listed.GetProperty("customized").GetBoolean());
        Assert.Contains("stats.read", Strings(listed.GetProperty("permissions")));

        // Volver a lo del rol.
        await owner.ExpectOkAsync(HttpMethod.Delete, path);
        Assert.Equal(HttpStatusCode.Forbidden, await support.StatusAsync(HttpMethod.Get, "/api/v1/stats/overview"));
        Assert.Equal(HttpStatusCode.OK, await support.StatusAsync(HttpMethod.Get, "/api/v1/orders"));

        // Cambiar el rol empieza de cero: las excepciones eran para el rol anterior.
        await owner.ExpectOkAsync(HttpMethod.Put, path, new { permissions = new[] { "orders.read", "costs.read" } });
        await owner.ExpectOkAsync(HttpMethod.Patch, $"/api/v1/members/{support.UserId}", new { role = "vendedor" });
        var after = await support.PermissionsAsync();
        Assert.DoesNotContain("costs.read", after);
        Assert.Contains("orders.fulfill", after);
    }

    [Fact]
    public async Task Las_reglas_de_las_excepciones()
    {
        var owner = await Merchant.CreateAsync(factory, "rul");
        var admin = await owner.AddTeammateAsync("admin");
        var seller = await owner.AddTeammateAsync("vendedor");
        var ownerId = (await owner.GetAsync("/api/v1/members")).GetProperty("items").EnumerateArray()
            .Single(m => m.GetProperty("role").GetString() == "owner").GetProperty("userId").GetGuid();

        // Nadie se edita a sí mismo, ni al dueño, ni a un par.
        Assert.Equal(HttpStatusCode.Forbidden, await admin.StatusAsync(HttpMethod.Put, $"/api/v1/members/{admin.UserId}/permissions", new { permissions = Array.Empty<string>() }));
        Assert.Equal(HttpStatusCode.BadRequest, await admin.StatusAsync(HttpMethod.Put, $"/api/v1/members/{ownerId}/permissions", new { permissions = Array.Empty<string>() }));
        var otherAdmin = await owner.AddTeammateAsync("admin");
        Assert.Equal(HttpStatusCode.Forbidden, await admin.StatusAsync(HttpMethod.Put, $"/api/v1/members/{otherAdmin.UserId}/permissions", new { permissions = Array.Empty<string>() }));

        // A alguien de abajo sí, y solo con lo que tiene.
        Assert.Equal(HttpStatusCode.NoContent, await admin.StatusAsync(HttpMethod.Put, $"/api/v1/members/{seller.UserId}/permissions",
            new { permissions = (await seller.PermissionsAsync()).Append("orders.refund").ToArray() }));
        Assert.Equal(HttpStatusCode.BadRequest, await admin.StatusAsync(HttpMethod.Put, $"/api/v1/members/{seller.UserId}/permissions",
            new { permissions = new[] { "tenant.admin" } }));
        Assert.Equal(HttpStatusCode.NotFound, (await owner.SendAsync(HttpMethod.Put, $"/api/v1/members/{Guid.NewGuid()}/permissions", new { permissions = Array.Empty<string>() })).StatusCode);
    }

    [Fact]
    public async Task Sumar_a_alguien_que_ya_esta_no_le_cambia_el_rol()
    {
        // Antes el alta de un email que ya era del equipo le cambiaba el rol,
        // salteando las reglas del cambio de rol (un admin podía bajar a otro admin).
        var owner = await Merchant.CreateAsync(factory, "dup");
        var admin = await owner.AddTeammateAsync("admin");
        var otherAdmin = await owner.AddTeammateAsync("admin");

        var again = await admin.SendAsync(HttpMethod.Post, "/api/v1/members", new { email = otherAdmin.Email, role = "soporte" });
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
        Assert.Contains("ya es del equipo", await again.Content.ReadAsStringAsync());
        Assert.Contains("members.manage", await otherAdmin.PermissionsAsync());
    }

    [Fact]
    public async Task Un_duenio_puede_cambiar_a_otro_duenio()
    {
        var owner = await Merchant.CreateAsync(factory, "own");
        var partner = await owner.AddTeammateAsync("owner");
        Assert.Equal(HttpStatusCode.NoContent, (await owner.SendAsync(HttpMethod.Patch, $"/api/v1/members/{partner.UserId}", new { role = "admin" })).StatusCode);
        Assert.DoesNotContain("tenant.admin", await partner.PermissionsAsync());
    }

    [Fact]
    public async Task Todo_queda_en_el_registro_de_actividad()
    {
        var owner = await Merchant.CreateAsync(factory, "log");
        var seller = await owner.AddTeammateAsync("vendedor");
        await owner.ExpectOkAsync(HttpMethod.Put, $"/api/v1/members/{seller.UserId}/permissions",
            new { permissions = (await seller.PermissionsAsync()).Append("orders.refund").ToArray() });
        await owner.ExpectOkAsync(HttpMethod.Put, $"{Roles}/soporte", new { permissions = new[] { "orders.read", "support.chat" } });
        await owner.ExpectOkAsync(HttpMethod.Patch, $"/api/v1/members/{seller.UserId}", new { role = "catalogo" });
        await owner.ExpectOkAsync(HttpMethod.Delete, $"/api/v1/members/{seller.UserId}");

        var log = await owner.GetAsync("/api/v1/members/activity");
        var items = log.GetProperty("items").EnumerateArray().ToList();
        Assert.Equal(5, log.GetProperty("total").GetInt32());
        Assert.Equal(["member.remove", "member.role", "role.permissions", "member.permissions", "member.add"],
            items.Select(e => e.GetProperty("action").GetString()));
        Assert.All(items, e => Assert.Equal(owner.Email, e.GetProperty("actorName").GetString()));

        string Summary(string action) => items.Single(e => e.GetProperty("action").GetString() == action).GetProperty("summary").GetString()!;
        Assert.Contains("como Vendedor", Summary("member.add"));
        Assert.Contains("le dio Devolver plata", Summary("member.permissions"));
        Assert.Contains("Soporte: le quitó", Summary("role.permissions"));
        Assert.Contains("Vendedor → Catálogo. Sus excepciones se borraron.", Summary("member.role"));
        Assert.Contains(seller.Email, Summary("member.remove"));

        // Lo ve quien puede ver el equipo; el resto, no.
        var other = await owner.AddTeammateAsync("soporte");
        Assert.Equal(HttpStatusCode.Forbidden, await other.StatusAsync(HttpMethod.Get, "/api/v1/members/activity"));
    }

    [Fact]
    public async Task Mis_tiendas_no_le_muestra_la_facturacion_a_quien_no_ve_estadisticas()
    {
        var owner = await Merchant.CreateAsync(factory, "tab");
        var support = await owner.AddTeammateAsync("soporte");

        var overview = await support.Client.GetFromJsonAsync<JsonElement>("/api/v1/tenants/overview");
        var mine = overview.GetProperty("items").EnumerateArray().Single(i => i.GetProperty("tenantId").GetGuid() == owner.TenantId);
        Assert.True(mine.GetProperty("restricted").GetBoolean());
        Assert.False(mine.TryGetProperty("revenueMinor", out _));

        var ownerView = (await owner.Client.GetFromJsonAsync<JsonElement>("/api/v1/tenants/overview")).GetProperty("items").EnumerateArray()
            .Single(i => i.GetProperty("tenantId").GetGuid() == owner.TenantId);
        Assert.True(ownerView.TryGetProperty("revenueMinor", out _));
    }
}
