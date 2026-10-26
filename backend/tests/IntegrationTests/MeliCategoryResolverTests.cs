using Api.Meli;
using MercadoLibre.Infrastructure;
using Microsoft.Extensions.DependencyInjection;

namespace IntegrationTests;

/// <summary>De dónde sale la categoría de ML de un producto: la guardada, la de su publicación o la predicha.</summary>
[Collection("api")]
public sealed class MeliCategoryResolverTests(ApiFactory factory)
{
    private const string MlApi = MeliAccount.Api;

    private static string NewId(string prefix) => $"{prefix}{Random.Shared.NextInt64(100_000_000_000, 999_999_999_999)}";

    private async Task<(Merchant Store, MeliReaderConnection Connection, Guid ProductId, Guid VariantId)> ArrangeAsync()
    {
        var store = await Merchant.CreateAsync(factory, "mlrs");
        await MeliAccount.SeedAsync(factory, store.TenantId);
        var (productId, variantId) = await store.CreateProductAsync("Taladro percutor Bosch");
        using var scope = factory.Services.CreateScope();
        var connection = await scope.ServiceProvider.GetRequiredService<MeliCatalogReader>()
            .ConnectAsync(store.TenantId, CancellationToken.None);
        return (store, connection!, productId, variantId);
    }

    private async Task<MeliCategoryResolution> ResolveAsync(MeliReaderConnection connection, Guid productId, string name)
    {
        using var scope = factory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<MeliCategoryResolver>()
            .ResolveAsync(connection, productId, name, CancellationToken.None);
    }

    [Fact]
    public async Task La_guardada_gana_y_no_llama_a_ML()
    {
        var (store, connection, productId, _) = await ArrangeAsync();
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MeliDbContext>();
            db.ProductCategories.Add(MeliProductCategory.Create(store.TenantId, productId, "MLA1", "Taladros", MeliCategorySource.Manual));
            await db.SaveChangesAsync();
        }
        var before = factory.ExternalHttp.SentTo(MlApi).Count;

        var result = await ResolveAsync(connection, productId, "Taladro percutor Bosch");

        var resolved = Assert.IsType<MeliCategoryResolution.Resolved>(result);
        Assert.Equal(new MeliCategoryRef("MLA1", "Taladros"), resolved.Category);
        Assert.Equal(MeliCategorySource.Manual, resolved.Source);
        Assert.Equal(before, factory.ExternalHttp.SentTo(MlApi).Count);
    }

    [Fact]
    public async Task Con_publicacion_vinculada_usa_su_categoria()
    {
        var (store, connection, productId, variantId) = await ArrangeAsync();
        var itemId = NewId("MLA");
        var categoryId = NewId("MLA");
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MeliDbContext>();
            db.ItemLinks.Add(MeliItemLink.Create(store.TenantId, itemId, null, productId, variantId, "Taladro").Value);
            await db.SaveChangesAsync();
        }
        factory.ExternalHttp.OnJson(HttpMethod.Get, $"{MlApi}/items/bulk?ids={itemId}",
            new object[] { new { status_code = 200, body = new { category_id = categoryId } } });
        factory.ExternalHttp.OnJson(HttpMethod.Get, $"{MlApi}/categories/{categoryId}", new { id = categoryId, name = "Taladros" });
        var predictionsBefore = factory.ExternalHttp.SentTo($"{MlApi}/sites/MLA/domain_discovery").Count;

        var result = await ResolveAsync(connection, productId, "Taladro percutor Bosch");

        var resolved = Assert.IsType<MeliCategoryResolution.Resolved>(result);
        Assert.Equal(new MeliCategoryRef(categoryId, "Taladros"), resolved.Category);
        Assert.Equal(MeliCategorySource.Listing, resolved.Source);
        Assert.Equal(predictionsBefore, factory.ExternalHttp.SentTo($"{MlApi}/sites/MLA/domain_discovery").Count);
    }

    [Fact]
    public async Task Con_publicacion_borrada_cae_a_la_prediccion()
    {
        var (store, connection, productId, variantId) = await ArrangeAsync();
        var itemId = NewId("MLA");
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MeliDbContext>();
            db.ItemLinks.Add(MeliItemLink.Create(store.TenantId, itemId, null, productId, variantId, "Taladro").Value);
            await db.SaveChangesAsync();
        }
        factory.ExternalHttp.OnJson(HttpMethod.Get, $"{MlApi}/items/bulk?ids={itemId}",
            new object[] { new { status_code = 404, body = new { message = "gone" } } });
        factory.ExternalHttp.OnJson(HttpMethod.Get, $"{MlApi}/sites/MLA/domain_discovery/search", new object[]
        {
            new { domain_name = "Taladros", category_id = "MLA7", category_name = "Taladros eléctricos" },
        });

        var result = await ResolveAsync(connection, productId, "Taladro percutor Bosch");

        Assert.Equal(MeliCategorySource.Predicted, Assert.IsType<MeliCategoryResolution.Resolved>(result).Source);
    }

    [Fact]
    public async Task Sin_vinculo_predice()
    {
        var (_, connection, productId, _) = await ArrangeAsync();
        factory.ExternalHttp.OnJson(HttpMethod.Get, $"{MlApi}/sites/MLA/domain_discovery/search", new object[]
        {
            new { domain_name = "Taladros", category_id = "MLA7", category_name = "Taladros eléctricos" },
        });

        var result = await ResolveAsync(connection, productId, "Taladro percutor Bosch");

        var resolved = Assert.IsType<MeliCategoryResolution.Resolved>(result);
        Assert.Equal(new MeliCategoryRef("MLA7", "Taladros eléctricos"), resolved.Category);
        Assert.Equal(MeliCategorySource.Predicted, resolved.Source);
    }

    [Fact]
    public async Task Prediccion_con_nombres_distintos_pide_que_una_persona_elija()
    {
        var (_, connection, productId, _) = await ArrangeAsync();
        factory.ExternalHttp.OnJson(HttpMethod.Get, $"{MlApi}/sites/MLA/domain_discovery/search", new object[]
        {
            new { domain_name = "Taladros", category_id = "MLA7", category_name = "Taladros eléctricos" },
            new { domain_name = "Atornilladores", category_id = "MLA8", category_name = "Atornilladores" },
        });

        var result = await ResolveAsync(connection, productId, "Taladro percutor Bosch");

        Assert.Equal(2, Assert.IsType<MeliCategoryResolution.Unclear>(result).Suggestions.Count);
    }
}
