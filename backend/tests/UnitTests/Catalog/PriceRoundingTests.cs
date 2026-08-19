using Catalog.Core.Domain;

namespace UnitTests.Catalog;

public class PriceRoundingTests
{
    [Theory]
    [InlineData("none")]
    [InlineData("100")]
    [InlineData("1000")]
    [InlineData("990")]
    public void IsValid_acepta_los_modos_del_dominio(string mode) =>
        Assert.True(PriceRounding.IsValid(mode));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("500")]
    [InlineData("NONE")]
    public void IsValid_rechaza_cualquier_otra_cosa(string? mode) =>
        Assert.False(PriceRounding.IsValid(mode));

    [Fact]
    public void None_deja_el_precio_intacto() =>
        Assert.Equal(12_345, PriceRounding.Apply(12_345, PriceRounding.None));

    [Theory]
    [InlineData(12_345_00, 12_300_00)]   // $12.345 -> $12.300
    [InlineData(12_360_00, 12_400_00)]   // para arriba
    [InlineData(12_390_00, 12_400_00)]
    public void Hundred_redondea_de_a_cien_pesos(long minor, long expected) =>
        Assert.Equal(expected, PriceRounding.Apply(minor, PriceRounding.Hundred));

    [Theory]
    [InlineData(45_600_00, 46_000_00)]
    [InlineData(45_400_00, 45_000_00)]
    public void Thousand_redondea_al_millar(long minor, long expected) =>
        Assert.Equal(expected, PriceRounding.Apply(minor, PriceRounding.Thousand));

    [Theory]
    [InlineData(45_600_00, 45_990_00)]  // el clásico "$45.990"
    [InlineData(45_400_00, 44_990_00)]
    public void NineNinety_termina_siempre_en_990(long minor, long expected) =>
        Assert.Equal(expected, PriceRounding.Apply(minor, PriceRounding.NineNinety));

    /// <summary>
    /// El piso de cada modo evita que un producto barato quede en cero — pero
    /// con "990" el piso ES $990: un producto de $500 SUBE de precio. Es la
    /// regla querida (el redondeo comercial no baja de su terminación) y está
    /// acá escrita para que nadie la "arregle" sin saber lo que rompe.
    /// </summary>
    [Theory]
    [InlineData(500_00, "990", 990_00)]
    [InlineData(500_00, "1000", 1000_00)]
    [InlineData(50, "100", 100_00)]
    public void Cada_modo_tiene_piso(long minor, string mode, long expected) =>
        Assert.Equal(expected, PriceRounding.Apply(minor, mode));

    [Fact]
    public void Un_modo_desconocido_no_toca_el_precio() =>
        Assert.Equal(12_345, PriceRounding.Apply(12_345, "500"));
}
