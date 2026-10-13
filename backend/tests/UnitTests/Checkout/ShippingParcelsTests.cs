using Catalog.Core.Domain;
using Checkout.Core.Domain;
using Checkout.Infrastructure.Carriers;
using SharedKernel.Common;

namespace UnitTests.Checkout;

/// <summary>Las piezas del envío por peso: el paquete de cada unidad, la huella del carrito y el bulto de Correo.</summary>
public class ShippingParcelsTests
{
    private static readonly ParcelUnit Default = new(800, 30, 20, 10);

    [Fact]
    public void Lo_que_la_variante_no_tiene_cargado_sale_del_default_del_correo()
    {
        Assert.Equal(new ParcelUnit(15_000, 40, 40, 5), ParcelUnit.For(15_000, 40, 40, 5, Default));
        Assert.Equal(new ParcelUnit(15_000, 30, 20, 10), ParcelUnit.For(15_000, null, null, null, Default));
        Assert.Equal(new ParcelUnit(800, 40, 40, 5), ParcelUnit.For(null, 40, 40, 5, Default));
        // Medidas a medias no arman una caja: van las del default.
        Assert.Equal(Default, ParcelUnit.For(null, 40, null, null, Default));
        Assert.Equal(8_000, new ParcelUnit(1, 40, 40, 5).VolumeCm3);
    }

    [Fact]
    public void La_huella_del_carrito_depende_de_que_hay_y_cuanto_no_del_orden()
    {
        var a = Guid.NewGuid();
        var b = Guid.NewGuid();
        var key = CartKey.Of([(a, 1), (b, 2)]);
        Assert.Equal(key, CartKey.Of([(b, 2), (a, 1)]));
        Assert.Equal(key, CartKey.Of([(b, 1), (a, 1), (b, 1)])); // líneas repetidas se suman
        Assert.NotEqual(key, CartKey.Of([(a, 2), (b, 1)]));      // mismas unidades, otro contenido
        Assert.NotEqual(key, CartKey.Of([(a, 1), (b, 3)]));
    }

    [Fact]
    public void Correo_suma_el_peso_apila_las_alturas_y_toma_la_base_mas_grande()
    {
        var package = CorreoPackage.Aggregate([new ParcelUnit(15_000, 40, 40, 5), Default, Default]);
        Assert.Equal(new CorreoPackage(16_600, 40, 40, 25), package);
        // Más de 25 kg no se cotiza online.
        Assert.Null(CorreoPackage.Aggregate([new ParcelUnit(15_000, 40, 40, 5), new ParcelUnit(15_000, 40, 40, 5)]));
        Assert.Null(CorreoPackage.Aggregate([]));
    }

    [Fact]
    public void El_peso_va_entre_1_g_y_1000_kg_y_las_medidas_las_tres_o_ninguna()
    {
        var product = Product.Create(TenantId.From(Guid.NewGuid()), "Disco", null).Value;
        var variant = product.AddVariant("DIS-15", [], new Money(10_000, "ARS")).Value;

        Assert.True(product.SetVariantShipping(variant.Id, 15_000, 40, 40, 5).IsSuccess);
        Assert.Equal((15_000, 40, 40, 5), (variant.WeightGrams, variant.LengthCm, variant.WidthCm, variant.HeightCm));

        Assert.Equal("Variant.IncompleteSize", product.SetVariantShipping(variant.Id, 100, 40, null, null).Error.Code);
        Assert.Equal("Variant.InvalidWeight", product.SetVariantShipping(variant.Id, 0, null, null, null).Error.Code);
        Assert.Equal("Variant.InvalidWeight", product.SetVariantShipping(variant.Id, 1_000_001, null, null, null).Error.Code);
        Assert.Equal("Variant.InvalidSize", product.SetVariantShipping(variant.Id, null, 501, 10, 10).Error.Code);
        Assert.Equal("Variant.NotFound", product.SetVariantShipping(Guid.NewGuid(), 1, null, null, null).Error.Code);

        Assert.True(product.SetVariantShipping(variant.Id, null, null, null, null).IsSuccess);
        Assert.Null(variant.WeightGrams);
    }
}
