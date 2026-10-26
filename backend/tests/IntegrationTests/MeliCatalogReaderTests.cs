using System.Net;
using Api.Meli;
using Microsoft.Extensions.DependencyInjection;


namespace IntegrationTests;

/// <summary>
/// El lector de categorías y atributos contra la API de Mercado Libre simulada: el worker lo usa sin request, así
/// que se resuelve desde un scope sin tienda y se le pasa la conexión leída de la base.
/// </summary>
[Collection("api")]
public sealed class MeliCatalogReaderTests(ApiFactory factory)
{
    private const string MlApi = MeliAccount.Api;

    private static string NewCategoryId() => $"MLA{Random.Shared.NextInt64(10_000_000, 99_999_999)}";

    private async Task<(MeliReaderConnection Connection, Guid TenantId)> ConnectedAsync()
    {
        var store = await Merchant.CreateAsync(factory, "mlrd");
        await MeliAccount.SeedAsync(factory, store.TenantId);
        using var scope = factory.Services.CreateScope();
        var reader = scope.ServiceProvider.GetRequiredService<MeliCatalogReader>();
        var connection = await reader.ConnectAsync(store.TenantId, CancellationToken.None);
        return (Assert.IsType<MeliReaderConnection>(connection), store.TenantId);
    }

    private MeliCatalogReader NewReader(out IServiceScope scope)
    {
        scope = factory.Services.CreateScope();
        return scope.ServiceProvider.GetRequiredService<MeliCatalogReader>();
    }

    [Fact]
    public async Task Atributos_se_piden_una_vez_por_categoria()
    {
        var (connection, _) = await ConnectedAsync();
        var category = NewCategoryId();
        factory.ExternalHttp.OnJson(HttpMethod.Get, $"{MlApi}/categories/{category}/attributes", new object[]
        {
            new { id = "BRAND", name = "Marca", tags = new { required = true }, value_type = "string" },
            new { id = "COLOR", name = "Color", tags = new { }, value_type = "list", values = new[] { new { id = "52049", name = "Negro" } } },
        });
        var reader = NewReader(out var scope);
        using var _ = scope;

        var first = await reader.AttributesAsync(connection, category, CancellationToken.None);
        var second = await reader.AttributesAsync(connection, category, CancellationToken.None);

        Assert.Equal(["BRAND", "COLOR"], first.Select(a => a.Id));
        Assert.Same(first, second);
        Assert.Single(factory.ExternalHttp.SentTo($"{MlApi}/categories/{category}/attributes"));
    }

    [Fact]
    public async Task Una_relevancia_no_entera_no_rompe_la_lectura_de_la_categoria()
    {
        var (connection, _) = await ConnectedAsync();
        var category = NewCategoryId();
        factory.ExternalHttp.On(HttpMethod.Get, $"{MlApi}/categories/{category}/attributes", (_, _) => FakeHttp.Json(
            """[{"id":"BRAND","name":"Marca","tags":{"required":true},"value_type":"string","relevance":1.5}]"""));
        var reader = NewReader(out var scope);
        using var _ = scope;

        var attributes = await reader.AttributesAsync(connection, category, CancellationToken.None);

        Assert.Equal(["BRAND"], attributes.Select(a => a.Id));
    }

    [Fact]
    public async Task Otra_tienda_aprovecha_la_cache_de_la_categoria()
    {
        var (first, _) = await ConnectedAsync();
        var (second, _) = await ConnectedAsync();
        var category = NewCategoryId();
        factory.ExternalHttp.OnJson(HttpMethod.Get, $"{MlApi}/categories/{category}", new { id = category, name = "Taladros" });
        var reader = NewReader(out var scope);
        using var _ = scope;

        Assert.Equal("Taladros", (await reader.CategoryAsync(first, category, CancellationToken.None))!.Name);
        Assert.Equal("Taladros", (await reader.CategoryAsync(second, category, CancellationToken.None))!.Name);

        Assert.Single(factory.ExternalHttp.SentTo($"{MlApi}/categories/{category}"));
    }

    [Fact]
    public async Task Demo_no_conecta()
    {
        var store = await Merchant.CreateAsync(factory, "mlrdd");
        await MeliAccount.SeedAsync(factory, store.TenantId, demo: true);
        var before = factory.ExternalHttp.SentTo(MlApi).Count;
        var reader = NewReader(out var scope);
        using var _ = scope;

        var connection = await reader.ConnectAsync(store.TenantId, CancellationToken.None);

        Assert.Null(connection);
        Assert.Equal(before, factory.ExternalHttp.SentTo(MlApi).Count);
    }

    [Fact]
    public async Task Sin_conexion_no_conecta()
    {
        var store = await Merchant.CreateAsync(factory, "mlrdn");
        var reader = NewReader(out var scope);
        using var _ = scope;

        Assert.Null(await reader.ConnectAsync(store.TenantId, CancellationToken.None));
    }

    [Fact]
    public async Task Item_borrado_da_null_y_item_vivo_da_su_categoria()
    {
        var (connection, _) = await ConnectedAsync();
        // Con el prefijo del id: otros tests dejan rutas más específicas (?ids=…) que ganan sobre /items/bulk a secas.
        var gone = $"MLA{Random.Shared.NextInt64(100_000_000_000, 999_999_999_999)}";
        var alive = $"MLA{Random.Shared.NextInt64(100_000_000_000, 999_999_999_999)}";
        factory.ExternalHttp.OnJson(HttpMethod.Get, $"{MlApi}/items/bulk?ids={gone}",
            new object[] { new { status_code = 404, body = new { message = "Item not found" } } });
        factory.ExternalHttp.OnJson(HttpMethod.Get, $"{MlApi}/items/bulk?ids={alive}",
            new object[] { new { status_code = 200, body = new { category_id = "MLA1" } } });
        var reader = NewReader(out var scope);
        using var _ = scope;

        Assert.Null(await reader.ItemCategoryIdAsync(connection, gone, CancellationToken.None));
        Assert.Equal("MLA1", await reader.ItemCategoryIdAsync(connection, alive, CancellationToken.None));
        Assert.Contains("attributes=body.category_id", factory.ExternalHttp.SentTo($"{MlApi}/items/bulk?ids={alive}").Last().Uri.Query);
    }

    [Fact]
    public async Task Categoria_inexistente_da_null()
    {
        var (connection, _) = await ConnectedAsync();
        var category = NewCategoryId();
        factory.ExternalHttp.OnJson(HttpMethod.Get, $"{MlApi}/categories/{category}", new { message = "not found" }, HttpStatusCode.NotFound);
        var reader = NewReader(out var scope);
        using var _ = scope;

        Assert.Null(await reader.CategoryAsync(connection, category, CancellationToken.None));
    }

    [Fact]
    public async Task Prediccion_pide_tres_sugerencias_con_el_site_de_la_tienda()
    {
        var (connection, _) = await ConnectedAsync();
        factory.ExternalHttp.OnJson(HttpMethod.Get, $"{MlApi}/sites/MLA/domain_discovery/search", new object[]
        {
            new { domain_name = "Taladros", category_id = "MLA1", category_name = "Taladros eléctricos" },
        });
        var reader = NewReader(out var scope);
        using var _ = scope;

        var suggestions = await reader.PredictAsync(connection, "Taladro percutor 13 mm", CancellationToken.None);

        Assert.Equal(new MeliCategorySuggestion("MLA1", "Taladros eléctricos", "Taladros"), Assert.Single(suggestions));
        var sent = factory.ExternalHttp.SentTo($"{MlApi}/sites/MLA/domain_discovery/search").Last();
        Assert.Contains("limit=3", sent.Uri.Query);
        Assert.Contains("Taladro%20percutor%2013%20mm", sent.Uri.Query);
    }
}
