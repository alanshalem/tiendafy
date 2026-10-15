using System.Globalization;
using SharedKernel.Common;

namespace UnitTests.Api;

/// <summary>
/// La hora y los números como los ve un comercio argentino, sin depender de la
/// cultura de la máquina: producción corre con la invariante y desarrollo en es-AR.
/// </summary>
public class ArgentineFormatTests
{
    [Fact]
    public void Una_venta_de_las_22_es_de_ese_dia_y_no_del_siguiente()
    {
        var utc = new DateTime(2026, 10, 16, 1, 30, 0, DateTimeKind.Utc); // 15-oct 22:30 en Argentina

        Assert.Equal(new DateOnly(2026, 10, 15), ArgentinaTime.DateOf(utc));
        Assert.Equal(new DateTime(2026, 10, 15, 22, 30, 0), ArgentinaTime.ToLocal(utc));
    }

    [Fact]
    public void El_dia_local_empieza_a_las_3_UTC()
    {
        var start = ArgentinaTime.StartOfDayUtc(new DateOnly(2026, 10, 15));

        Assert.Equal(new DateTime(2026, 10, 15, 3, 0, 0, DateTimeKind.Utc), start);
        Assert.Equal(DateTimeKind.Utc, start.Kind);
        Assert.Equal(start, ArgentinaTime.ToUtc(new DateTime(2026, 10, 15, 0, 0, 0)));
    }

    [Theory]
    [InlineData("")] // invariante, como el contenedor de producción
    [InlineData("en-US")]
    [InlineData("es-AR")]
    public void Los_montos_llevan_punto_de_miles_en_cualquier_cultura(string culture)
    {
        var previous = CultureInfo.CurrentCulture;
        CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo(culture);
        try
        {
            Assert.Equal("1.500", ArgentineNumbers.Number(1500m));
            Assert.Equal("1.234.567,89", ArgentineNumbers.Number(1234567.891m, 2));
            Assert.Equal("ARS 1.500", ArgentineNumbers.Money(new Money(1500_00, "ARS")));
            Assert.Equal("-2.000", ArgentineNumbers.Number(-2000m));
        }
        finally
        {
            CultureInfo.CurrentCulture = previous;
        }
    }
}
