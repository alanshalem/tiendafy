using Catalog.Core.Domain;
using SharedKernel.Common;

namespace UnitTests.Catalog;

public class ChangeVariantPriceTests
{
    private static readonly TenantId Tenant = TenantId.New();
    private static Money Ars(long cents) => TestData.Ars(cents);

    [Fact]
    public void ChangeVariantPrice_UpdatesPriceAndCompareAt()
    {
        var product = Product.Create(Tenant, "Bowl").Value;
        var variant = product.AddVariant("BOWL-01", [], Ars(100_000)).Value;

        var result = product.ChangeVariantPrice(variant.Id, Ars(150_000), Ars(200_000));

        Assert.True(result.IsSuccess);
        Assert.Equal(150_000, variant.Price.AmountInMinorUnits);
        Assert.Equal(200_000, variant.CompareAtPrice!.Value.AmountInMinorUnits);
    }

    [Fact]
    public void ChangeVariantPrice_UnknownVariant_NotFound()
    {
        var product = Product.Create(Tenant, "Bowl").Value;

        var result = product.ChangeVariantPrice(Guid.NewGuid(), Ars(100));

        Assert.True(result.IsFailure);
        Assert.Equal(ErrorType.NotFound, result.Error.Type);
    }

    [Fact]
    public void ChangeVariantPrice_Negative_Fails()
    {
        var product = Product.Create(Tenant, "Bowl").Value;
        var variant = product.AddVariant("BOWL-01", [], Ars(100)).Value;

        var result = product.ChangeVariantPrice(variant.Id, Ars(-5));

        Assert.Equal("Variant.NegativePrice", result.Error.Code);
    }
}
