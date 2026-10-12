using System.Net;
using System.Text.Json;

namespace IntegrationTests;

/// <summary>
/// Editar una tienda del grupo: el nombre, la URL y el dominio propio no se
/// pueden repetir con otra tienda, un dominio inválido se explica, vaciarlo lo
/// quita, y una tienda eliminada ya no se edita ni se reactiva.
/// </summary>
[Collection("api")]
public sealed class TenantEditTests(ApiFactory factory)
{
    private static async Task<string?> CodeAsync(HttpResponseMessage res) =>
        (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("title").GetString();

    [Fact]
    public async Task Nombre_URL_y_dominio_unicos_y_dominio_que_se_quita()
    {
        var merchant = await Merchant.CreateAsync(factory, "ted");
        var other = await merchant.OpenAnotherStoreAsync("ted2");
        var domain = $"www.{merchant.Subdomain}.com.ar";
        await merchant.PatchAsync($"/api/v1/tenants/{merchant.TenantId}", new
        {
            name = $"Tienda {merchant.Subdomain}",
            subdomain = merchant.Subdomain,
            customDomain = domain,
        });

        async Task<(HttpStatusCode, string?)> Edit(object body)
        {
            var res = await merchant.SendAsync(HttpMethod.Patch, $"/api/v1/tenants/{other.TenantId}", body);
            return (res.StatusCode, await CodeAsync(res));
        }

        Assert.Equal((HttpStatusCode.Conflict, "Tenant.NameTaken"),
            await Edit(new { name = $"Tienda {merchant.Subdomain}", subdomain = other.Subdomain, customDomain = (string?)null }));
        Assert.Equal((HttpStatusCode.Conflict, "Tenant.SubdomainTaken"),
            await Edit(new { name = "Otra", subdomain = merchant.Subdomain, customDomain = (string?)null }));
        Assert.Equal((HttpStatusCode.Conflict, "Tenant.CustomDomainTaken"),
            await Edit(new { name = "Otra", subdomain = other.Subdomain, customDomain = domain.ToUpperInvariant() }));
        Assert.Equal((HttpStatusCode.BadRequest, "Tenant.InvalidCustomDomain"),
            await Edit(new { name = "Otra", subdomain = other.Subdomain, customDomain = "no es un dominio" }));

        // Vaciar el dominio propio lo quita.
        var cleared = await merchant.PatchAsync($"/api/v1/tenants/{merchant.TenantId}", new
        {
            name = $"Tienda {merchant.Subdomain}",
            subdomain = merchant.Subdomain,
            customDomain = "",
        });
        Assert.Equal(JsonValueKind.Null, cleared.GetProperty("customDomain").ValueKind);
    }

    [Fact]
    public async Task Una_tienda_eliminada_no_se_edita_ni_se_reactiva()
    {
        var merchant = await Merchant.CreateAsync(factory, "tdl");
        var doomed = await merchant.OpenAnotherStoreAsync("tdl2");
        await merchant.ExpectOkAsync(HttpMethod.Delete, $"/api/v1/tenants/{doomed.TenantId}");

        var edit = await merchant.SendAsync(HttpMethod.Patch, $"/api/v1/tenants/{doomed.TenantId}",
            new { name = "Revivida", subdomain = doomed.Subdomain, customDomain = (string?)null });
        Assert.Equal(HttpStatusCode.Conflict, edit.StatusCode);
        Assert.Equal("Tenant.Canceled", await CodeAsync(edit));

        var activate = await merchant.SendAsync(HttpMethod.Post, $"/api/v1/tenants/{doomed.TenantId}/activate", new { });
        Assert.Equal(HttpStatusCode.Conflict, activate.StatusCode);
        Assert.Equal("Tenant.InvalidTransition", await CodeAsync(activate));
    }
}
