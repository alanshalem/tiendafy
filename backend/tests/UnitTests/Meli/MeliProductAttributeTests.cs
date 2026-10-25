using MercadoLibre.Infrastructure;

namespace UnitTests.Meli;

public class MeliProductAttributeTests
{
    [Fact]
    public void Create_exige_valueId_o_valueName()
    {
        Assert.Throws<ArgumentException>(() =>
            MeliProductAttribute.Create(Guid.NewGuid(), Guid.NewGuid(), "BRAND", null, null, null));
    }

    [Fact]
    public void Create_normaliza_attributeId_a_mayusculas()
    {
        var attr = MeliProductAttribute.Create(Guid.NewGuid(), Guid.NewGuid(), " brand ", null, "Acme", null);
        Assert.Equal("BRAND", attr.AttributeId);
    }

    [Fact]
    public void Category_Change_actualiza_origen_y_nombre()
    {
        var cat = MeliProductCategory.Create(Guid.NewGuid(), Guid.NewGuid(), "MLA1", "Cat", MeliCategorySource.Predicted);
        cat.Change("MLA2", "Otra", MeliCategorySource.Manual);
        Assert.Equal("MLA2", cat.CategoryId);
        Assert.Equal("Otra", cat.CategoryName);
        Assert.Equal(MeliCategorySource.Manual, cat.Source);
    }
}
