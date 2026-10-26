using Api.Ai.Catalog;
using Catalog.Core.Domain;
using MercadoLibre.Infrastructure;
using SharedKernel.Common;

namespace UnitTests.Api.Ai.Catalog;

public sealed class AiCatalogProductDataTests
{
    private static readonly TenantId Tenant = TestData.Tenant;

    private static SpecDefinition Definition(string name, string? meliId, SpecType type = SpecType.Text, string? unit = null, params Guid[] categories)
    {
        var definition = SpecDefinition.Create(Tenant, name, type, 0).Value;
        definition.Update(name, type, unit, null, categories, true, false, meliId, 0);
        return definition;
    }

    private static Product NewProduct()
    {
        var product = Product.Create(Tenant, "Taladro percutor Bosch", "Potente y liviano.").Value;
        product.SetBrand("Bosch");
        product.AddOption("Voltaje", ["110 V", "220 V"]);
        product.AddVariant("TAL-110", ["110 V"], new Money(15_000_00, "ARS"));
        product.AddVariant("TAL-220", ["220 V"], new Money(16_000_00, "ARS"));
        product.SetVariantBarcode(product.Variants[0].Id, "7790001000017");
        return product;
    }

    private static MeliProductAttribute Saved(Guid productId, string id, string value) =>
        MeliProductAttribute.Create(Tenant.Value, productId, id, null, value, null);

    [Fact]
    public void SourceText_incluye_nombre_descripcion_skus_y_specs()
    {
        var product = NewProduct();
        var power = Definition("Potencia", "POWER", SpecType.Number, "W");
        product.SetSpecs([(power.Id, "600")]);

        var data = AiCatalogProductData.From(product, [power], [Saved(product.Id, "MODEL", "GSB 13 RE")], ["Herramientas"]);

        var text = data.SourceText;
        Assert.Contains("Taladro percutor Bosch", text);
        Assert.Contains("Potente y liviano.", text);
        Assert.Contains("Bosch", text);
        Assert.Contains("TAL-110", text);
        Assert.Contains("TAL-220", text);
        Assert.Contains("7790001000017", text);
        Assert.Contains("110 V", text);
        Assert.Contains("Potencia", text);
        Assert.Contains("600 W", text);
        Assert.Contains("Herramientas", text);
        Assert.Contains("GSB 13 RE", text);
    }

    [Fact]
    public void No_lleva_precios_ni_costos()
    {
        var data = AiCatalogProductData.From(NewProduct(), [], [], []);

        Assert.DoesNotContain("15000", data.SourceText);
        Assert.DoesNotContain("15.000", data.SourceText);
    }

    [Fact]
    public void Spec_mapeada_de_la_categoria_del_producto_cuenta_como_cargada()
    {
        var product = NewProduct();
        var category = Guid.NewGuid();
        product.SetCategories([category]);
        var power = Definition("Potencia", "POWER", SpecType.Number, "W", category);
        product.SetSpecs([(power.Id, "600")]);

        var data = AiCatalogProductData.From(product, [power], [], []);

        Assert.Contains("POWER", data.FilledMeliAttributeIds());
    }

    [Fact]
    public void Spec_mapeada_de_otra_categoria_no_cuenta_como_cargada()
    {
        var product = NewProduct();
        product.SetCategories([Guid.NewGuid()]);
        var power = Definition("Potencia", "POWER", SpecType.Number, "W", Guid.NewGuid());
        product.SetSpecs([(power.Id, "600")]);

        var data = AiCatalogProductData.From(product, [power], [], []);

        Assert.DoesNotContain("POWER", data.FilledMeliAttributeIds());
    }

    [Fact]
    public void Spec_mapeada_sin_valor_o_sin_mapeo_no_cuenta_como_cargada()
    {
        var product = NewProduct();
        var mapped = Definition("Potencia", "POWER");
        var plain = Definition("Material", null);
        product.SetSpecs([(plain.Id, "Acero")]);

        var data = AiCatalogProductData.From(product, [mapped, plain], [], []);

        Assert.DoesNotContain("POWER", data.FilledMeliAttributeIds());
        // Pero la spec sin mapeo sí se la cuenta al modelo.
        Assert.Contains(("Material", "Acero"), data.Specs);
    }

    [Fact]
    public void BRAND_cuenta_como_cargada_si_hay_marca()
    {
        var withBrand = AiCatalogProductData.From(NewProduct(), [], [], []);
        var product = Product.Create(Tenant, "Sin marca").Value;
        var without = AiCatalogProductData.From(product, [], [], []);

        Assert.Contains("BRAND", withBrand.FilledMeliAttributeIds());
        Assert.DoesNotContain("BRAND", without.FilledMeliAttributeIds());
    }

    [Fact]
    public void Los_atributos_guardados_de_ML_cuentan_como_cargados()
    {
        var product = NewProduct();

        var data = AiCatalogProductData.From(product, [], [Saved(product.Id, "IS_KIT", "No")], []);

        Assert.Contains("IS_KIT", data.FilledMeliAttributeIds());
        Assert.Contains(("IS_KIT", "No"), data.SavedMeliAttributes);
    }
}
