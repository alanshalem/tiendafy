using Catalog.Contracts.Events;
using Catalog.Core.Domain;
using SharedKernel.Common;
using SharedKernel.Exceptions;

namespace UnitTests.Catalog;

/// <summary>
/// Caminos de Product que faltaban: galería de imágenes, SEO, marca,
/// categorías, precios de variantes, restore y eventos de dominio (que además
/// cubren AggregateRoot/Entity de SharedKernel).
/// </summary>
public class ProductCatalogDomainTests
{
    private static readonly TenantId Tenant = TenantId.New();
    private static readonly Money Precio = new(100_000, "ARS");

    private static Product Producto()
    {
        var p = Product.Create(Tenant, "Remera Oversize").Value;
        p.AddVariant("SKU-1", [], Precio);
        return p;
    }

    // ---- Eventos de dominio (cubre también Entity/AggregateRoot) ----

    [Fact]
    public void Create_y_Publish_emiten_eventos_de_dominio_y_se_pueden_limpiar()
    {
        var p = Producto();
        Assert.Contains(p.DomainEvents, e => e is ProductCreatedEvent);

        p.Publish();
        Assert.Contains(p.DomainEvents, e => e is ProductPublishedEvent);

        p.ClearDomainEvents();
        Assert.Empty(p.DomainEvents);

        // Publish repetido es idempotente y no re-emite el evento.
        p.Publish();
        Assert.DoesNotContain(p.DomainEvents, e => e is ProductPublishedEvent);
    }

    // ---- Estado: publish/archive/restore ----

    [Fact]
    public void No_se_publica_sin_variantes_ni_archivado_y_Restore_solo_desde_archivado()
    {
        var sinVariantes = Product.Create(Tenant, "Vacío").Value;
        Assert.Equal("Product.NoVariants", sinVariantes.Publish().Error.Code);

        var p = Producto();
        p.Archive();
        Assert.Equal(ProductStatus.Archived, p.Status);
        Assert.Equal("Product.Archived", p.Publish().Error.Code);

        p.Restore();
        Assert.Equal(ProductStatus.Draft, p.Status);
        Assert.True(p.Publish().IsSuccess);

        Assert.Throws<DomainException>(() => p.Restore()); // no archivado
    }

    [Theory]
    [InlineData("DRAFT", ProductStatus.Draft)]
    [InlineData("active", ProductStatus.Active)]
    [InlineData("Archived", ProductStatus.Archived)]
    [InlineData("nope", null)]
    [InlineData(null, null)]
    public void ParseApi_mapea_estados_case_insensitive(string? raw, ProductStatus? expected)
    {
        Assert.Equal(expected, ProductStatusExtensions.ParseApi(raw));
        Assert.Equal("ACTIVE", ProductStatus.Active.ToApiString());
    }

    // ---- Galería de imágenes ----

    [Fact]
    public void Imagenes_validan_URL_respetan_el_maximo_y_compactan_al_borrar()
    {
        var p = Producto();
        Assert.Equal("Image.InvalidUrl", p.AddImage("no-es-url", null).Error.Code);

        var img1 = p.AddImage("https://cdn.x/1.jpg", "frente").Value;
        var img2 = p.AddImage("https://cdn.x/2.jpg", null).Value;
        var img3 = p.AddImage("https://cdn.x/3.jpg", null).Value;
        Assert.Equal([0, 1, 2], p.Images.Select(i => i.Position));

        // Borrar la del medio compacta posiciones (0,1 contiguas).
        Assert.True(p.RemoveImage(img2.Id).IsSuccess);
        Assert.Equal([0, 1], p.Images.Select(i => i.Position));
        Assert.Equal([img1.Id, img3.Id], p.Images.Select(i => i.Id));

        Assert.False(p.RemoveImage(Guid.NewGuid()).IsSuccess); // inexistente

        // Tope de imágenes.
        for (var i = p.Images.Count; i < Product.MaxImages; i++)
            Assert.True(p.AddImage($"https://cdn.x/extra-{i}.jpg", null).IsSuccess);
        Assert.Equal("Image.TooMany", p.AddImage("https://cdn.x/otra.jpg", null).Error.Code);

        p.ClearImages();
        Assert.Empty(p.Images);
    }

    [Fact]
    public void ReorderImages_aplica_el_orden_dado_y_manda_al_final_las_no_listadas()
    {
        var p = Producto();
        var a = p.AddImage("https://cdn.x/a.jpg", null).Value;
        var b = p.AddImage("https://cdn.x/b.jpg", null).Value;
        var c = p.AddImage("https://cdn.x/c.jpg", null).Value;

        p.ReorderImages([c.Id, a.Id]); // b no listada → al final

        Assert.Equal([c.Id, a.Id, b.Id], p.Images.Select(i => i.Id));
        Assert.Equal([0, 1, 2], p.Images.Select(i => i.Position));
    }

    // ---- SEO / marca / categorías / detalles ----

    [Fact]
    public void SetSeo_y_SetBrand_normalizan_vacios_y_recortan()
    {
        var p = Producto();
        p.SetSeo("  Título SEO  ", "   ");
        Assert.Equal("Título SEO", p.SeoTitle);
        Assert.Null(p.SeoDescription);

        p.SetBrand("  Royal Canin  ");
        Assert.Equal("Royal Canin", p.Brand);
        p.SetBrand(new string('x', 150));
        Assert.Equal(100, p.Brand!.Length); // recorte a 100
        p.SetBrand("  ");
        Assert.Null(p.Brand);
    }

    [Fact]
    public void SetCategories_ignora_vacios_y_duplicados()
    {
        var p = Producto();
        var cat = Guid.NewGuid();
        p.SetCategories([cat, Guid.Empty, cat]);
        Assert.Equal([cat], p.CategoryIds);
    }

    [Fact]
    public void UpdateDetails_valida_nombre_y_NO_regenera_el_slug()
    {
        var p = Producto();
        var slugOriginal = p.Slug.Value;

        Assert.Equal("Product.InvalidName", p.UpdateDetails("", "desc").Error.Code);

        Assert.True(p.UpdateDetails("Nombre Nuevo", " desc ").IsSuccess);
        Assert.Equal("Nombre Nuevo", p.Name);
        Assert.Equal(slugOriginal, p.Slug.Value); // el SEO no se rompe en renombres
    }

    // ---- Variantes: precio y combinaciones ----

    [Fact]
    public void ChangeVariantPrice_valida_variante_y_precio()
    {
        var p = Producto();
        var v = p.Variants[0];

        Assert.False(p.ChangeVariantPrice(Guid.NewGuid(), Precio).IsSuccess); // inexistente
        Assert.Equal("Variant.NegativePrice", p.ChangeVariantPrice(v.Id, new Money(-1, "ARS")).Error.Code);

        Assert.True(p.ChangeVariantPrice(v.Id, new Money(200_000, "ARS"), new Money(250_000, "ARS")).IsSuccess);
        Assert.Equal(200_000, v.Price.AmountInMinorUnits);
        Assert.Equal(250_000, v.CompareAtPrice!.Value.AmountInMinorUnits);
    }

    [Fact]
    public void Variantes_exigen_combinacion_valida_y_unica_de_opciones()
    {
        var p = Product.Create(Tenant, "Con opciones").Value;
        p.AddOption("Talle", ["S", "M"]);

        // Las opciones se bloquean cuando ya hay variantes.
        Assert.True(p.AddVariant("T-S", ["S"], Precio).IsSuccess);
        Assert.Equal("Product.OptionsLocked", p.AddOption("Color", ["Rojo"]).Error.Code);

        Assert.Equal("Variant.OptionMismatch", p.AddVariant("T-X", [], Precio).Error.Code);
        Assert.Equal("Variant.UnknownOptionValue", p.AddVariant("T-L", ["L"], Precio).Error.Code);
        Assert.Equal("Variant.DuplicateCombination", p.AddVariant("T-S2", ["S"], Precio).Error.Code);
        Assert.Equal("Variant.DuplicateSku", p.AddVariant("t-s", ["M"], Precio).Error.Code);
    }
}
