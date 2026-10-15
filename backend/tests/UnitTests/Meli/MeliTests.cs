using System.Text.Json;
using Api.Meli;
using MercadoLibre.Infrastructure;

namespace UnitTests.Meli;

public class MeliConnectionTests
{
    [Fact]
    public void Create_Valido_NormalizaSite()
    {
        var result = MeliConnection.Create(
            Guid.NewGuid(), 123456, "  MITIENDA ", "mla", "enc-access", "enc-refresh",
            DateTime.UtcNow.AddHours(6));
        Assert.True(result.IsSuccess);
        Assert.Equal("MLA", result.Value.SiteId);
        Assert.Equal("MITIENDA", result.Value.Nickname);
        Assert.False(result.Value.StockSyncEnabled);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-5)]
    public void Create_UserIdInvalido_Falla(long userId)
    {
        var result = MeliConnection.Create(
            Guid.NewGuid(), userId, "nick", "MLA", "enc", "enc", DateTime.UtcNow);
        Assert.True(result.IsFailure);
    }

    [Fact]
    public void UpdateTokens_ConservaNicknameSiVieneVacio()
    {
        var c = MeliConnection.Create(
            Guid.NewGuid(), 1, "original", "MLA", "a", "r", DateTime.UtcNow).Value;
        c.UpdateTokens(1, "", "", "a2", "r2", DateTime.UtcNow.AddHours(6));
        Assert.Equal("original", c.Nickname);
        Assert.Equal("MLA", c.SiteId);
        Assert.Equal("a2", c.AccessTokenEnc);
    }
}

public class MeliLinkResolverTests
{
    private static MeliLinkResolver WithLink(long? variationId = null)
    {
        var link = MeliItemLink.Create(
            Guid.NewGuid(), "MLA123", variationId, Guid.NewGuid(), Guid.NewGuid(), "Producto");
        return MeliLinkResolver.From([link.Value]);
    }

    [Fact]
    public void Resuelve_VinculoAnivelItem_AunqueLaVentaTraigaVariacion()
    {
        var resolver = WithLink();
        Assert.True(resolver.TryResolve("MLA123", 99, out var variantId));
        Assert.NotEqual(Guid.Empty, variantId);
    }

    [Fact]
    public void SinItemId_NoResuelve_YNoRevienta()
    {
        // El snapshot de la venta se arma con lo que manda Mercado Libre: si el
        // id de la publicación no viene, llega null hasta acá. Antes eso tiraba
        // ArgumentNullException y se caía la pantalla de Rentabilidad entera.
        var resolver = WithLink();

        Assert.False(resolver.TryResolve(null, null, out var deNull));
        Assert.Equal(Guid.Empty, deNull);

        Assert.False(resolver.TryResolve("   ", null, out var deVacio));
        Assert.Equal(Guid.Empty, deVacio);
    }

    [Fact]
    public void ItemDesconocido_NoResuelve()
    {
        Assert.False(WithLink().TryResolve("MLA999", null, out _));
    }
}

public class MeliItemLinkTests
{
    [Fact]
    public void Create_NormalizaItemId()
    {
        var result = MeliItemLink.Create(
            Guid.NewGuid(), " mla123456789 ", null, Guid.NewGuid(), Guid.NewGuid(), "Título");
        Assert.True(result.IsSuccess);
        Assert.Equal("MLA123456789", result.Value.MeliItemId);
        Assert.True(result.Value.SyncStock);
        Assert.Null(result.Value.LastPushedQty);
    }

    [Fact]
    public void Create_SinVariante_Falla()
    {
        var result = MeliItemLink.Create(
            Guid.NewGuid(), "MLA1", null, Guid.NewGuid(), Guid.Empty, "t");
        Assert.True(result.IsFailure);
    }

    [Fact]
    public void MarkPushed_GuardaUltimoValor()
    {
        var link = MeliItemLink.Create(
            Guid.NewGuid(), "MLA1", 77, Guid.NewGuid(), Guid.NewGuid(), "t").Value;
        link.MarkPushed(12);
        Assert.Equal(12, link.LastPushedQty);
        Assert.Equal(77, link.MeliVariationId);
    }

    [Fact]
    public void Volver_a_prender_un_switch_olvida_lo_ultimo_empujado()
    {
        // Mientras estuvo apagado, la publicación pudo cambiar en ML: al
        // prenderlo, la próxima pasada tiene que mandar el valor de la tienda.
        var link = MeliItemLink.Create(
            Guid.NewGuid(), "MLA1", null, Guid.NewGuid(), Guid.NewGuid(), "t").Value;
        link.MarkPushed(12);
        link.MarkPricePushed(1_000_00);

        link.SetSyncStock(false);
        link.SetSyncPrice(false);
        Assert.Equal(12, link.LastPushedQty); // apagar no borra nada
        Assert.False(link.SyncStock);

        link.SetSyncStock(true);
        Assert.Null(link.LastPushedQty);
        Assert.Equal(1_000_00, link.LastPushedPriceMinor); // cada switch con lo suyo

        link.SetSyncPrice(true);
        Assert.Null(link.LastPushedPriceMinor);

        // Prender lo que ya estaba prendido no fuerza nada.
        link.MarkPushed(3);
        link.SetSyncStock(true);
        Assert.Equal(3, link.LastPushedQty);
    }
}

public class MeliNotificationTests
{
    [Fact]
    public void Receive_TruncaTopicYResource()
    {
        var n = MeliNotification.Receive(new string('t', 100), new string('r', 400), 9);
        Assert.Equal(60, n.Topic.Length);
        Assert.Equal(300, n.Resource.Length);
        Assert.Equal(MeliNotification.StatusPending, n.Status);
    }

    [Fact]
    public void MarkFailed_SeisIntentos_QuedaDead()
    {
        var n = MeliNotification.Receive("orders_v2", "/orders/1", 9);
        for (var i = 0; i < MeliNotification.MaxAttempts; i++) n.MarkFailed("boom");
        Assert.Equal(MeliNotification.StatusDead, n.Status);
        Assert.Equal(MeliNotification.MaxAttempts, n.Attempts);
    }

    [Theory]
    [InlineData("/orders/2000012345", 2000012345L)]
    [InlineData("/orders/2000012345/", 2000012345L)]
    [InlineData("/marketplace/orders/55", 55L)]
    [InlineData("/orders/abc", null)]
    [InlineData("", null)]
    public void ParseOrderId_ExtraeElIdDelResource(string resource, long? expected)
    {
        Assert.Equal(expected, MeliNotificationWorker.ParseOrderId(resource));
    }
}

public class MeliOrderTests
{
    [Fact]
    public void Apply_MapeaYActualiza()
    {
        var order = MeliOrder.Create(Guid.NewGuid(), 123);
        order.Apply("paid", DateTime.UtcNow, null, 1500.50m, 1500.50m, "ARS",
            42, "COMPRADOR", "[]", packId: 999, shipmentId: 555, shipmentStatus: null);

        Assert.True(order.IsPaid);
        Assert.False(order.StockApplied);
        Assert.Equal(999, order.PackId);
        Assert.Equal("COMPRADOR", order.BuyerNickname);

        order.MarkStockApplied();
        Assert.True(order.StockApplied);
    }

    [Theory]
    [InlineData("paid", true)]
    [InlineData("partially_refunded", true)]
    [InlineData("confirmed", false)]
    [InlineData("cancelled", false)]
    public void IsPaid_SoloEstadosCobrados(string status, bool expected)
    {
        var order = MeliOrder.Create(Guid.NewGuid(), 1);
        order.Apply(status, DateTime.UtcNow, null, 1, 1, "ARS", 1, "b", "[]", null, null, null);
        Assert.Equal(expected, order.IsPaid);
        // La lista que usan las consultas (estadísticas, reposición, filtros) es la misma regla.
        Assert.Equal(expected, MeliOrder.EarningStatuses.Contains(status));
    }

    private static MeliOrder Sold(string status)
    {
        var order = MeliOrder.Create(Guid.NewGuid(), 1);
        order.Apply("paid", DateTime.UtcNow, null, 1, 1, "ARS", 1, "b", "[]", null, null, null);
        order.MarkStockApplied();
        order.Apply(status, DateTime.UtcNow, null, 1, 1, "ARS", 1, "b", "[]", null, null, null);
        return order;
    }

    /// <summary>
    /// Una venta de ML que se cancela tiene que devolver el stock que descontó:
    /// sin esto la mercadería quedaba descontada para siempre y la tienda
    /// dejaba de vender lo que en realidad tenía en el depósito.
    /// </summary>
    [Fact]
    public void VentaCancelada_PideDevolverElStock() =>
        Assert.True(Sold("cancelled").NeedsStockReversal);

    [Fact]
    public void DevolverElStock_SeHaceUnaSolaVez()
    {
        var order = Sold("cancelled");
        order.MarkStockReverted();
        Assert.False(order.NeedsStockReversal);
    }

    /// <summary>
    /// "refunded" es una devolución DESPUÉS del envío: la mercadería puede
    /// estar en viaje, dañada o perdida, así que el reingreso lo decide una
    /// persona (igual que en la tienda propia). No se toca el stock solo.
    /// </summary>
    [Theory]
    [InlineData("refunded")]
    [InlineData("paid")]
    public void OtrosEstados_NoDevuelvenStockSolos(string status) =>
        Assert.False(Sold(status).NeedsStockReversal);

    [Fact]
    public void SinStockDescontado_NoHayNadaQueDevolver()
    {
        var order = MeliOrder.Create(Guid.NewGuid(), 1);
        order.Apply("cancelled", DateTime.UtcNow, null, 1, 1, "ARS", 1, "b", "[]", null, null, null);
        Assert.False(order.NeedsStockReversal);
    }
}

/// <summary>
/// Precio que se publica en ML. Tiene plata adentro: el canal cobra más
/// comisión que la tienda propia, así que el recargo es lo que evita vender en
/// ML con la mitad del margen.
/// </summary>
public class MeliPricingTests
{
    [Theory]
    [InlineData(10_000_00, 0, 10_000_00)]      // mismo precio que la tienda
    [InlineData(10_000_00, 15, 11_500_00)]     // recargo del 15 %
    [InlineData(10_000_00, -10, 9_000_00)]     // más barato en ML
    [InlineData(9_990_00, 12.5, 11_238_75)]    // con decimales, sin perder centavos
    public void ForChannel_AplicaElRecargo(long localMinor, decimal pct, long expected) =>
        Assert.Equal(expected, MeliPricing.ForChannel(localMinor, pct));

    [Fact]
    public void ForChannel_SinPrecioLocal_DevuelveCero() =>
        Assert.Equal(0, MeliPricing.ForChannel(0, 20));

    /// <summary>ML no acepta publicaciones en cero: el piso es un centavo.</summary>
    [Fact]
    public void ForChannel_NuncaPublicaEnCero() =>
        Assert.Equal(1, MeliPricing.ForChannel(1, -50));

    [Fact]
    public void ToApiAmount_ConvierteCentavosAPesos() =>
        Assert.Equal(11_500m, MeliPricing.ToApiAmount(11_500_00));

    [Theory]
    [InlineData(500, 200)]     // el recargo se acota…
    [InlineData(-90, -50)]     // …en los dos extremos
    public void Conexion_AcotaElRecargoAUnRangoSensato(decimal pedido, decimal esperado)
    {
        var connection = MeliConnection.Create(
            Guid.NewGuid(), 1, "tienda", "MLA", "enc", "enc", DateTime.UtcNow.AddHours(6)).Value;
        connection.SetPriceSync(true, pedido);
        Assert.Equal(esperado, connection.PriceMarkupPct);
    }
}

public class MeliSyncParseTests
{
    [Fact]
    public void ParseItems_OrdenRealDeMl_ExtraeItemsConVariacionYSku()
    {
        // Shape real (recortado) de GET /orders/{id} de la API de ML.
        const string json = """
        {
          "id": 2000012345,
          "status": "paid",
          "order_items": [
            {
              "item": {
                "id": "MLA123",
                "title": "Remera negra",
                "variation_id": 181,
                "seller_sku": "REM-N-M"
              },
              "quantity": 2,
              "unit_price": 8500.5
            },
            {
              "item": { "id": "MLA456", "title": "Gorra" },
              "quantity": 1,
              "unit_price": 5000
            }
          ]
        }
        """;
        using var doc = JsonDocument.Parse(json);
        var items = MeliSyncService.ParseItems(doc.RootElement);

        Assert.Equal(2, items.Count);
        Assert.Equal("MLA123", items[0].ItemId);
        Assert.Equal(181, items[0].VariationId);
        Assert.Equal("REM-N-M", items[0].Sku);
        Assert.Equal(2, items[0].Quantity);
        Assert.Equal(8500.5m, items[0].UnitPrice);
        Assert.Null(items[1].VariationId);
        Assert.Null(items[1].Sku);
    }

    [Fact]
    public void ParseItems_SinItems_ListaVacia()
    {
        using var doc = JsonDocument.Parse("""{"id": 1}""");
        Assert.Empty(MeliSyncService.ParseItems(doc.RootElement));
    }
}
