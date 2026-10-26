using System.Net;
using System.Text.Json;
using MercadoLibre.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace IntegrationTests;

/// <summary>
/// Los atributos y la categoría que se guardan de un producto para Mercado Libre (al aprobar las fichas con IA) y cómo llegan a
/// una publicación: al publicar, y al actualizar una que ya existe.
/// </summary>
[Collection("api")]
public sealed class MeliListingAttributesTests(ApiFactory factory)
{
    private const string Api = MeliAccount.Api;

    private async Task SaveAsync(Guid tenantId, Guid productId, params MeliProductAttribute[] attributes)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MeliDbContext>();
        db.ProductAttributes.AddRange(attributes);
        await db.SaveChangesAsync();
    }

    private async Task SaveCategoryAsync(Guid tenantId, Guid productId, string categoryId, string name, MeliCategorySource source)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MeliDbContext>();
        db.ProductCategories.Add(MeliProductCategory.Create(tenantId, productId, categoryId, name, source));
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task Publicar_manda_los_atributos_guardados()
    {
        var (store, _) = await MeliAccount.ConnectAsync(factory, "mla1");
        var itemId = $"MLA{Random.Shared.NextInt64(1_000_000_000, 9_000_000_000)}";
        factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Api}/items", new { id = itemId, permalink = (string?)null });
        var (productId, _) = await store.CreateProductAsync("Taladro con ficha", priceMinor: 30_000_00, stock: 5);
        await SaveAsync(store.TenantId, productId,
            MeliProductAttribute.Create(store.TenantId, productId, "IS_KIT", "242084", "No", null),
            MeliProductAttribute.Create(store.TenantId, productId, "GTIN", null, "7790001000017", null),
            MeliProductAttribute.Create(store.TenantId, productId, "LENGTH", null, "2", "m"));

        await store.PostAsync($"/api/v1/admin/meli/products/{productId}/publish", new { categoryId = "MLA1" });

        var body = JsonDocument.Parse(factory.ExternalHttp.SentTo($"{Api}/items").Last(r => r.Uri.AbsolutePath == "/items").Body!).RootElement;
        var attributes = body.GetProperty("attributes").EnumerateArray().ToDictionary(a => a.GetProperty("id").GetString()!);
        Assert.Equal("242084", attributes["IS_KIT"].GetProperty("value_id").GetString());
        Assert.Equal("7790001000017", attributes["GTIN"].GetProperty("value_name").GetString());
        Assert.Equal("2 m", attributes["LENGTH"].GetProperty("value_name").GetString());
        Assert.Contains("SELLER_SKU", attributes.Keys);
    }

    [Fact]
    public async Task Categoria_guardada_se_ofrece_al_publicar()
    {
        var (store, _) = await MeliAccount.ConnectAsync(factory, "mla2");
        var (productId, _) = await store.CreateProductAsync("Taladro con categoría");
        var (other, _) = await store.CreateProductAsync("Taladro sin categoría");
        await SaveCategoryAsync(store.TenantId, productId, "MLA1", "Taladros eléctricos", MeliCategorySource.Manual);

        var saved = await store.GetAsync($"/api/v1/admin/meli/products/{productId}/category");
        var none = await store.GetAsync($"/api/v1/admin/meli/products/{other}/category");

        Assert.Equal("MLA1", saved.GetProperty("categoryId").GetString());
        Assert.Equal("Taladros eléctricos", saved.GetProperty("categoryName").GetString());
        Assert.Equal("Manual", saved.GetProperty("source").GetString());
        Assert.Equal(JsonValueKind.Null, none.GetProperty("categoryId").ValueKind);
    }

    [Fact]
    public async Task La_categoria_guardada_es_de_la_tienda()
    {
        var (store, _) = await MeliAccount.ConnectAsync(factory, "mla3");
        var (productId, _) = await store.CreateProductAsync("Taladro");
        await SaveCategoryAsync(store.TenantId, productId, "MLA1", "Taladros eléctricos", MeliCategorySource.Predicted);
        var (other, _) = await MeliAccount.ConnectAsync(factory, "mla4");

        var asOther = await other.GetAsync($"/api/v1/admin/meli/products/{productId}/category");

        Assert.Equal(JsonValueKind.Null, asOther.GetProperty("categoryId").ValueKind);
    }

    [Fact]
    public async Task Solo_con_MeliPublish()
    {
        var (store, _) = await MeliAccount.ConnectAsync(factory, "mla5");
        var (productId, _) = await store.CreateProductAsync("Taladro");
        var support = await store.AddTeammateAsync("soporte", "mlsp");

        Assert.Equal(HttpStatusCode.Forbidden, await support.StatusAsync(HttpMethod.Get, $"/api/v1/admin/meli/products/{productId}/category"));
    }
}
