using Catalog.Contracts.Events;
using Catalog.Core.Domain;
using SharedKernel.Common;
using static UnitTests.TestData;

namespace UnitTests.Catalog;

public class ProductTests
{

    private static Product CreateBasic() => Product.Create(Tenant, "Remera Oversize").Value;

    private static Product CreateWithOptions()
    {
        var product = CreateBasic();
        product.AddOption("Talle", ["S", "M", "L"]);
        product.AddOption("Color", ["Negro", "Crudo"]);
        return product;
    }

    [Fact]
    public void Create_GeneratesSlugAndRaisesEvent()
    {
        var product = Product.Create(Tenant, "Café de Especialidad 250g").Value;

        Assert.Equal("cafe-de-especialidad-250g", product.Slug.Value);
        Assert.Equal(ProductStatus.Draft, product.Status);
        Assert.Single(product.DomainEvents.OfType<ProductCreatedEvent>());
    }

    [Fact]
    public void AddOption_RejectsDuplicateNameCaseInsensitive()
    {
        var product = CreateBasic();
        product.AddOption("Talle", ["S"]);

        var result = product.AddOption("TALLE", ["M"]);

        Assert.Equal("Product.DuplicateOption", result.Error.Code);
    }

    [Fact]
    public void AddOption_RejectsFourthOption()
    {
        var product = CreateBasic();
        product.AddOption("Talle", ["S"]);
        product.AddOption("Color", ["Negro"]);
        product.AddOption("Material", ["Algodón"]);

        var result = product.AddOption("Estampa", ["Lisa"]);

        Assert.Equal("Product.TooManyOptions", result.Error.Code);
    }

    [Fact]
    public void AddOption_AfterVariantsExist_Fails()
    {
        var product = CreateWithOptions();
        product.AddVariant("REM-S-NEG", ["S", "Negro"], Ars(2_990_000));

        var result = product.AddOption("Material", ["Algodón"]);

        Assert.Equal("Product.OptionsLocked", result.Error.Code);
    }

    [Fact]
    public void AddVariant_HappyPath()
    {
        var product = CreateWithOptions();

        var result = product.AddVariant("REM-M-NEG", ["M", "Negro"], Ars(2_990_000), Ars(3_990_000));

        Assert.True(result.IsSuccess);
        Assert.Equal("REM-M-NEG", result.Value.Sku);
        Assert.Single(product.Variants);
    }

    [Fact]
    public void AddVariant_WrongValueCount_Fails()
    {
        var product = CreateWithOptions();

        var result = product.AddVariant("X", ["M"], Ars(100));

        Assert.Equal("Variant.OptionMismatch", result.Error.Code);
    }

    [Fact]
    public void AddVariant_UnknownOptionValue_Fails()
    {
        var product = CreateWithOptions();

        var result = product.AddVariant("X", ["XL", "Negro"], Ars(100));

        Assert.Equal("Variant.UnknownOptionValue", result.Error.Code);
    }

    [Fact]
    public void AddVariant_DuplicateSku_Fails()
    {
        var product = CreateWithOptions();
        product.AddVariant("SKU-1", ["S", "Negro"], Ars(100));

        var result = product.AddVariant("sku-1", ["M", "Negro"], Ars(100));

        Assert.Equal("Variant.DuplicateSku", result.Error.Code);
    }

    [Fact]
    public void AddVariant_DuplicateCombination_Fails()
    {
        var product = CreateWithOptions();
        product.AddVariant("SKU-1", ["S", "Negro"], Ars(100));

        var result = product.AddVariant("SKU-2", ["s", "NEGRO"], Ars(100));

        Assert.Equal("Variant.DuplicateCombination", result.Error.Code);
    }

    [Fact]
    public void AddVariant_NegativePrice_Fails()
    {
        var product = CreateWithOptions();

        var result = product.AddVariant("X", ["S", "Negro"], Ars(-1));

        Assert.Equal("Variant.NegativePrice", result.Error.Code);
    }

    [Fact]
    public void AddVariant_WithoutOptions_AllowsSingleDefault()
    {
        // Producto simple sin opciones: una variante con cero valores.
        var product = CreateBasic();

        var result = product.AddVariant("UNICO", [], Ars(500_000));

        Assert.True(result.IsSuccess);
    }

    [Fact]
    public void Publish_WithoutVariants_Fails()
    {
        var product = CreateBasic();

        var result = product.Publish();

        Assert.Equal("Product.NoVariants", result.Error.Code);
    }

    [Fact]
    public void Publish_WithVariant_ActivatesAndRaisesEvent()
    {
        var product = CreateBasic();
        product.AddVariant("UNICO", [], Ars(100));

        var result = product.Publish();

        Assert.True(result.IsSuccess);
        Assert.Equal(ProductStatus.Active, product.Status);
        Assert.Single(product.DomainEvents.OfType<ProductPublishedEvent>());
    }

    [Fact]
    public void Publish_Twice_IsIdempotent()
    {
        var product = CreateBasic();
        product.AddVariant("UNICO", [], Ars(100));
        product.Publish();

        var result = product.Publish();

        Assert.True(result.IsSuccess);
        Assert.Single(product.DomainEvents.OfType<ProductPublishedEvent>());
    }

    [Fact]
    public void Publish_Archived_Fails()
    {
        var product = CreateBasic();
        product.AddVariant("UNICO", [], Ars(100));
        product.Archive();

        var result = product.Publish();

        Assert.Equal("Product.Archived", result.Error.Code);
    }

    [Fact]
    public void UpdateDetails_KeepsSlugStable()
    {
        var product = Product.Create(Tenant, "Nombre Original").Value;
        var originalSlug = product.Slug.Value;

        product.UpdateDetails("Nombre Completamente Nuevo", "desc");

        Assert.Equal("Nombre Completamente Nuevo", product.Name);
        Assert.Equal(originalSlug, product.Slug.Value);
    }

    [Fact]
    public void SetVariantCost_sets_clears_and_rejects_negative()
    {
        var product = CreateWithOptions();
        var variant = product.AddVariant("REM-S-NEG", ["S", "Negro"], Ars(2_990_000), cost: Ars(1_200_000)).Value;
        Assert.Equal(1_200_000, variant.Cost!.Value.AmountInMinorUnits);

        Assert.True(product.SetVariantCost(variant.Id, Ars(1_500_000)).IsSuccess);
        Assert.Equal(1_500_000, variant.Cost!.Value.AmountInMinorUnits);

        Assert.True(product.SetVariantCost(variant.Id, null).IsSuccess);
        Assert.Null(variant.Cost);

        Assert.True(product.SetVariantCost(variant.Id, new Money(-1, "ARS")).IsFailure);
        Assert.True(product.SetVariantCost(Guid.NewGuid(), Ars(100)).IsFailure);
    }
}
