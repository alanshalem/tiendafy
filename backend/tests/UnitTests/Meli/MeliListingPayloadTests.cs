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

        var listing = MeliListingPayload.Build(product, variant, Connection(15m), "MLA1", null, 5, new Dictionary<Guid, string>());

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

        var listing = MeliListingPayload.Build(product, variant, Connection(15m, priceSync: false), "MLA1", null, 5, new Dictionary<Guid, string>());

        Assert.Equal(10_000_00, listing.PriceMinor);
        Assert.Equal(10_000m, listing.Payload["price"]);
    }

    [Fact]
    public void Sin_recargo_sale_el_precio_de_la_tienda()
    {
        var (product, variant) = Remera(9_900_00);

        var listing = MeliListingPayload.Build(product, variant, Connection(0m), "MLA1", null, 5, new Dictionary<Guid, string>());

        Assert.Equal(9_900m, listing.Payload["price"]);
        Assert.Equal("ARS", listing.Payload["currency_id"]);
    }

    [Fact]
    public void Stock_con_colchon_tipo_por_defecto_y_atributos()
    {
        var (product, variant) = Remera(1_000_00);

        var listing = MeliListingPayload.Build(product, variant, Connection(0m, buffer: 2), "MLA1", " ", 5, new Dictionary<Guid, string>());

        Assert.Equal(3, listing.Payload["available_quantity"]);
        Assert.Equal("gold_special", listing.Payload["listing_type_id"]);
        Assert.Equal("MLA1", listing.Payload["category_id"]);
        var attributes = Assert.IsType<List<object>>(listing.Payload["attributes"]);
        Assert.Equal(2, attributes.Count); // BRAND y SELLER_SKU

        // Con un colchón más grande que el stock, ML igual exige al menos una unidad.
        var tight = MeliListingPayload.Build(product, variant, Connection(0m, buffer: 10), "MLA1", "gold_pro", 5, new Dictionary<Guid, string>());
        Assert.Equal(1, tight.Payload["available_quantity"]);
        Assert.Equal("gold_pro", tight.Payload["listing_type_id"]);
    }
}
