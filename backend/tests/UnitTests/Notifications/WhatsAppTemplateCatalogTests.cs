using Notifications.Infrastructure;

namespace UnitTests.Notifications;

/// <summary>
/// Los textos del catálogo de WhatsApp que ve el comercio en el panel.
/// </summary>
public class WhatsAppTemplateCatalogTests
{
    /// <summary>
    /// El de carritos abandonados decía que sale "solo con clientes que
    /// aceptaron recibir novedades", una casilla que ya no existe: lo que vale
    /// es la del aviso por WhatsApp junto al teléfono, en la compra.
    /// </summary>
    [Fact]
    public void Carritos_abandonados_nombra_la_casilla_del_aviso_por_WhatsApp()
    {
        var def = WhatsAppTemplateCatalog.Find("carritos-abandonados")!;

        Assert.DoesNotContain("novedades", def.Description, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("por WhatsApp si dejo la compra sin terminar", def.Description, StringComparison.Ordinal);
    }
}
