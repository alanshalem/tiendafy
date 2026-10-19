using Api.Meli;
using Catalog.Core.Domain;
using MercadoLibre.Infrastructure;
using SharedKernel.Common;

namespace UnitTests.Meli;

/// <summary>
/// El cuerpo con el que se publica un producto en ML. Lo que más importa es el
/// precio: tiene que salir con el recargo del canal, el mismo que después
/// empuja la sincronización. Antes salía al precio de la tienda.
/// </summary>
public class MeliListingPayloadTests
{
    private static MeliConnection Connection(decimal markupPct, int buffer = 0, bool priceSync = true)
    {
        var c = MeliConnection.Create(Guid.NewGuid(), 1, "tienda", "MLA", "enc", "enc", DateTime.UtcNow.AddHours(6)).Value;
        c.SetPriceSync(priceSync, markupPct);
        c.SetStockSync(false, buffer);
        return c;
    }

    private static (Product Product, Variant Variant) Remera(long priceMinor)
    {
        var product = Product.Create(TenantId.From(Guid.NewGuid()), "Remera oversize").Value;
        product.SetBrand("Marca");
        var variant = product.AddVariant("REM-1", [], new Money(priceMinor, "ARS")).Value;
        return (product, variant);
    }

    [Fact]
    public void El_precio_publicado_lleva_el_recargo_del_canal()
    {
        var (product, variant) = Remera(10_000_00);

        var listing = MeliListingPayload.Build(product, variant, Connection(15m), "MLA1", null, 5, new Dictionary<Guid, string>()).Value;

        Assert.Equal(11_500_00, listing.PriceMinor);
        Assert.Equal(11_500m, listing.Payload["price"]);
        // El mismo número que empuja la sincronización de precios.
        Assert.Equal(MeliPricing.ToApiAmount(MeliPricing.ForChannel(10_000_00, 15m)), listing.Payload["price"]);
    }

    [Fact]
    public void Sin_sincronizacion_de_precios_un_recargo_guardado_no_se_aplica()
    {
        // El panel muestra el recargo solo con la sincronización prendida: uno
        // que quedó guardado de antes no puede subir el precio a escondidas.
        var (product, variant) = Remera(10_000_00);

        var listing = MeliListingPayload.Build(product, variant, Connection(15m, priceSync: false), "MLA1", null, 5, new Dictionary<Guid, string>()).Value;

        Assert.Equal(10_000_00, listing.PriceMinor);
        Assert.Equal(10_000m, listing.Payload["price"]);
    }

    [Fact]
    public void Sin_recargo_sale_el_precio_de_la_tienda()
    {
        var (product, variant) = Remera(9_900_00);

        var listing = MeliListingPayload.Build(product, variant, Connection(0m), "MLA1", null, 5, new Dictionary<Guid, string>()).Value;

        Assert.Equal(9_900m, listing.Payload["price"]);
        Assert.Equal("ARS", listing.Payload["currency_id"]);
    }

    [Fact]
    public void Stock_con_colchon_tipo_por_defecto_y_atributos()
    {
        var (product, variant) = Remera(1_000_00);

        var listing = MeliListingPayload.Build(product, variant, Connection(0m, buffer: 2), "MLA1", " ", 5, new Dictionary<Guid, string>()).Value;

        Assert.Equal(3, listing.Payload["available_quantity"]);
        // Lo que queda registrado como último empujado es lo que viajó, no el disponible.
        Assert.Equal(3, listing.Quantity);
        Assert.Equal("gold_special", listing.Payload["listing_type_id"]);
        Assert.Equal("MLA1", listing.Payload["category_id"]);
        var attributes = Assert.IsType<List<object>>(listing.Payload["attributes"]);
        Assert.Equal(2, attributes.Count); // BRAND y SELLER_SKU

        var justOne = MeliListingPayload.Build(product, variant, Connection(0m, buffer: 4), "MLA1", "gold_pro", 5, new Dictionary<Guid, string>()).Value;
        Assert.Equal(1, justOne.Payload["available_quantity"]);
        Assert.Equal("gold_pro", justOne.Payload["listing_type_id"]);
    }

    [Fact]
    public void Stock_sin_limite_publica_la_cantidad_fija_sin_colchon()
    {
        var (product, variant) = Remera(1_000_00);

        var listing = MeliListingPayload.Build(product, variant, Connection(0m, buffer: 10), "MLA1", null, null, new Dictionary<Guid, string>()).Value;

        Assert.Equal(MeliListingPayload.UnlimitedQuantity, listing.Payload["available_quantity"]);
        Assert.Equal(MeliListingPayload.UnlimitedQuantity, listing.Quantity);
        Assert.Equal(MeliListingPayload.UnlimitedQuantity, MeliListingPayload.QuantityFor(null, Connection(0m, buffer: 3)));
        Assert.Equal(7, MeliListingPayload.QuantityFor(10, Connection(0m, buffer: 3)));
    }

    [Theory]
    [InlineData(5)]
    [InlineData(10)]
    public void Si_el_colchon_se_come_todo_el_stock_no_se_publica(int buffer)
    {
        // Antes se publicaba 1 unidad igual: justo la sobreventa que el colchón evita.
        var (product, variant) = Remera(1_000_00);

        var result = MeliListingPayload.Build(product, variant, Connection(0m, buffer: buffer), "MLA1", null, 5, new Dictionary<Guid, string>());

        Assert.True(result.IsFailure);
        Assert.Equal("Meli.BufferExceedsStock", result.Error.Code);
        Assert.Contains("colchón", result.Error.Message);
    }
}
