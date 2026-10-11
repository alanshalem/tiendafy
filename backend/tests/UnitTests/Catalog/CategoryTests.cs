using Catalog.Core.Domain;
using static UnitTests.TestData;

namespace UnitTests.Catalog;

public class CategoryTests
{

    [Fact]
    public void Create_Root_HasSlugAsPath()
    {
        var category = Category.Create(Tenant, "Indumentaria").Value;

        Assert.Equal("indumentaria", category.Path);
        Assert.Equal(1, category.Depth);
        Assert.Null(category.ParentId);
    }

    [Fact]
    public void Create_Child_BuildsMaterializedPath()
    {
        var root = Category.Create(Tenant, "Indumentaria").Value;
        var child = Category.Create(Tenant, "Remeras y Tops", root).Value;

        Assert.Equal("indumentaria/remeras-y-tops", child.Path);
        Assert.Equal(2, child.Depth);
        Assert.Equal(root.Id, child.ParentId);
    }

    [Fact]
    public void Create_BeyondMaxDepth_Fails()
    {
        var l1 = Category.Create(Tenant, "Uno").Value;
        var l2 = Category.Create(Tenant, "Dos", l1).Value;
        var l3 = Category.Create(Tenant, "Tres", l2).Value;

        var result = Category.Create(Tenant, "Cuatro", l3);

        Assert.True(result.IsFailure);
        Assert.Equal("Category.TooDeep", result.Error.Code);
    }

    [Theory]
    [InlineData("")]
    [InlineData(null)]
    public void Create_InvalidName_Fails(string? name)
    {
        var result = Category.Create(Tenant, name);

        Assert.True(result.IsFailure);
        Assert.Equal("Category.InvalidName", result.Error.Code);
    }

    [Fact]
    public void Rename_KeepsPathStable()
    {
        var category = Category.Create(Tenant, "Indumentaria").Value;

        category.Rename("Ropa");

        Assert.Equal("Ropa", category.Name);
        Assert.Equal("indumentaria", category.Path); // URLs de la tienda no se rompen
    }
}
