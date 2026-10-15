using System.Globalization;
using Api.Notifications;
using Orders.Core.Domain;
using SharedKernel.Common;

namespace UnitTests.Notifications;

/// <summary>
/// Los montos que lee el comprador (mail, WhatsApp, campañas) salen con punto
/// de miles aunque el proceso corra con la cultura invariante, como el
/// contenedor de producción: antes salía "ARS 1,500".
/// </summary>
public class NotificationNumbersTests
{
    private static T WithCulture<T>(CultureInfo culture, Func<T> act)
    {
        var previous = CultureInfo.CurrentCulture;
        CultureInfo.CurrentCulture = culture;
        try
        {
            return act();
        }
        finally
        {
            CultureInfo.CurrentCulture = previous;
        }
    }

    [Fact]
    public void El_monto_de_las_notificaciones_lleva_punto_de_miles_con_cultura_invariante()
    {
        var text = WithCulture(CultureInfo.InvariantCulture, () => MoneyFormat.ForNotification(new Money(1_234_567_00, "ARS")));

        Assert.Equal("ARS 1.234.567", text);
    }

    [Fact]
    public void Las_cards_de_producto_de_una_campania_muestran_el_precio_con_punto_de_miles()
    {
        var products = new List<CampaignProduct> { new(Guid.NewGuid(), "Remera", 15_000_00, "ARS", null, "remera") };

        var html = WithCulture(CultureInfo.InvariantCulture,
            () => CampaignEmailComposer.ComposeForPreview("<p>Hola</p>", products, "https://tienda.test"));

        Assert.Contains("$ 15.000</div>", html);
    }

    [Fact]
    public void El_tope_de_reembolso_del_panel_sale_con_punto_de_miles_y_centavos()
    {
        var error = WithCulture(CultureInfo.InvariantCulture,
            () => OrderErrors.RefundExceedsRemaining(new Money(15_000_50, "ARS")));

        // Antes: "(15000.50 ARS)" con la cultura invariante de producción.
        Assert.Equal("El monto supera lo reembolsable (ARS 15.000,50).", error.Message);
    }

    [Theory]
    [InlineData(0L)]
    [InlineData(99L)]
    [InlineData(150L)]
    [InlineData(1_000_00L)]
    [InlineData(15_000_50L)]
    [InlineData(1_234_567_89L)]
    public void Las_campanias_salen_igual_que_cuando_formateaban_con_es_AR(long minor)
    {
        // Las campañas ya formateaban con es-AR explícito: pasar a
        // ArgentineNumbers no puede cambiar ni un byte del mail.
        var esAr = (minor / 100m).ToString("N0", CultureInfo.GetCultureInfo("es-AR"));

        Assert.Equal(esAr, ArgentineNumbers.Number(minor / 100m));
    }
}
