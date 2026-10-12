using System.Net;
using System.Text.Json;
using Api.Startup;
using Microsoft.AspNetCore.Mvc.Testing.Handlers;

namespace IntegrationTests;

/// <summary>
/// Las cuentas de prueba de desarrollo: una por rol, en todas las tiendas, para
/// probar el panel como lo ve cada uno (docs/usuarios-de-prueba.md).
/// </summary>
[Collection("api")]
public sealed class DevTeamSeedTests(ApiFactory factory)
{
    [Fact]
    public async Task Hay_una_cuenta_por_rol_en_cada_tienda_y_no_pisa_cambios()
    {
        var owner = await Merchant.CreateAsync(factory, "dts");
        await factory.Services.SeedDevAdminAsync();

        var members = (await owner.GetAsync("/api/v1/members?limit=100")).GetProperty("items").EnumerateArray()
            .ToDictionary(m => m.GetProperty("email").GetString()!, m => m.GetProperty("role").GetString());
        foreach (var (email, _, role) in DevAdminSeeder.Team)
            Assert.Equal(role, members[email]);
        // Cada rol de la matriz tiene su cuenta.
        Assert.Equal(
            Identity.Infrastructure.Roles.All.Select(r => r.Key).Order(),
            DevAdminSeeder.Team.Select(t => t.Role).Distinct().Order());

        // Entra con su clave y ve lo de su rol.
        var seller = factory.CreateDefaultClient(new CookieContainerHandler());
        Assert.Equal(HttpStatusCode.OK, (await seller.PostAsJsonAsync("/api/v1/auth/login",
            new { email = "vendedor@tiendafy.local", password = DevAdminSeeder.Password })).StatusCode);
        var perms = await owner.SendAsync(seller, HttpMethod.Get, "/api/v1/me/permissions");
        Assert.Equal("vendedor", (await perms.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("role").GetString());

        // Un rol cambiado desde el panel se respeta al volver a sembrar.
        var sellerId = (await owner.GetAsync("/api/v1/members?limit=100")).GetProperty("items").EnumerateArray()
            .Single(m => m.GetProperty("email").GetString() == "vendedor@tiendafy.local").GetProperty("userId").GetGuid();
        await owner.ExpectOkAsync(HttpMethod.Patch, $"/api/v1/members/{sellerId}", new { role = "soporte" });
        await factory.Services.SeedDevAdminAsync();
        var after = (await owner.GetAsync("/api/v1/members?limit=100")).GetProperty("items").EnumerateArray()
            .Single(m => m.GetProperty("userId").GetGuid() == sellerId);
        Assert.Equal("soporte", after.GetProperty("role").GetString());
    }
}
