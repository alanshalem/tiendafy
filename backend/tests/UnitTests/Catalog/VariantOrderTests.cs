using System.Reflection;
using Catalog.Core.Domain;
using static UnitTests.TestData;

namespace UnitTests.Catalog;

/// <summary>
/// Las variantes salen en el orden de las opciones del producto, venga la
/// consulta que venga.
///
/// Los ids son aleatorios y ninguna consulta ordenaba: el listado del panel
/// las devolvía en un orden y la ficha en otro —un collar de talles XS, S, M y
/// L aparecía como L, M, S, XS en la tienda—, así que la primera variante, la
/// que la tienda muestra elegida, dependía de por dónde se cargó el producto.
/// </summary>
public sealed class VariantOrderTests
{
    /// <summary>Simula lo que hace EF: llena la lista interna en el orden de la consulta.</summary>
    private static void DesordenarComoLaBase(Product product)
    {
        var interna = (List<Variant>)typeof(Product)
            .GetField("_variants", BindingFlags.NonPublic | BindingFlags.Instance)!
            .GetValue(product)!;
        interna.Reverse();
    }

    [Fact]
    public void Siguen_el_orden_de_los_valores_de_la_opcion()
    {
        // El caso real: Zeedog Collar Honey, talle {XS,S,M,L}, cargado en
        // cualquier orden. Tiene que salir XS, S, M, L.
        var product = Product.Create(Tenant, "Zeedog Collar Honey").Value;
        Assert.True(product.AddOption("Talle", ["XS", "S", "M", "L"]).IsSuccess);
        foreach (var (sku, talle) in new[] { ("05", "L"), ("04", "M"), ("03", "S"), ("02", "XS") })
            Assert.True(product.AddVariant(sku, [talle], Ars(1)).IsSuccess);

        Assert.Equal(["XS", "S", "M", "L"], product.Variants.Select(v => v.OptionValues[0]));
    }

    [Fact]
    public void El_orden_no_depende_de_como_las_cargue_la_base()
    {
        var product = Product.Create(Tenant, "Collar").Value;
        Assert.True(product.AddOption("Talle", ["S", "M", "L"]).IsSuccess);
        foreach (var t in new[] { "S", "M", "L" })
            Assert.True(product.AddVariant($"COL-{t}", [t], Ars(1)).IsSuccess);

        DesordenarComoLaBase(product);

        Assert.Equal(["COL-S", "COL-M", "COL-L"], product.Variants.Select(v => v.Sku));
    }

    [Fact]
    public void Con_dos_opciones_manda_la_primera()
    {
        var product = Product.Create(Tenant, "Remera").Value;
        Assert.True(product.AddOption("Talle", ["S", "M"]).IsSuccess);
        Assert.True(product.AddOption("Color", ["Negro", "Blanco"]).IsSuccess);
        Assert.True(product.AddVariant("M-B", ["M", "Blanco"], Ars(1)).IsSuccess);
        Assert.True(product.AddVariant("S-B", ["S", "Blanco"], Ars(1)).IsSuccess);
        Assert.True(product.AddVariant("M-N", ["M", "Negro"], Ars(1)).IsSuccess);
        Assert.True(product.AddVariant("S-N", ["S", "Negro"], Ars(1)).IsSuccess);

        Assert.Equal(["S-N", "S-B", "M-N", "M-B"], product.Variants.Select(v => v.Sku));
    }

    [Fact]
    public void Una_sola_variante_sin_opciones_queda_igual()
    {
        var product = Product.Create(Tenant, "Bowl").Value;
        Assert.True(product.AddVariant("BOWL", [], Ars(1)).IsSuccess);

        Assert.Equal("BOWL", Assert.Single(product.Variants).Sku);
    }
}
