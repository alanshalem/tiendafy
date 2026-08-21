using Api.Shipping;
using Checkout.Core.Domain;
using SharedKernel.Common;

namespace UnitTests.Checkout;

public class AndreaniConfigTests
{
    private static AndreaniConfig New() =>
        AndreaniConfig.Create(Guid.NewGuid(), "cifrada").Value;

    private static Result Save(
        AndreaniConfig config, string? home = "300006611", string? branch = null,
        int weight = 1000, int length = 30, int width = 20, int height = 15,
        decimal? factor = null) =>
        config.Update(
            "usuario", null, "0003750", home, branch, "PRC", useQa: false, factor,
            "Tienda SRL", "ventas@tienda.com", "CUIT", "30712345678", "1145678900",
            "Av. Santa Fe", "3253", "C.A.B.A.", "1425",
            weight, length, width, height, active: true);

    [Fact]
    public void SinNingunContratoNoSePuedeGuardar()
    {
        // Cada modalidad de entrega es un contrato distinto y es el contrato el
        // que define la tarifa: sin ninguno no hay nada que cotizar.
        var result = Save(New(), home: null, branch: null);
        Assert.True(result.IsFailure);
        Assert.Equal("Andreani.MissingContract", result.Error.Code);
    }

    [Fact]
    public void ElHostSaleDelAmbiente()
    {
        var config = New();
        Save(config);
        Assert.Equal(AndreaniConfig.ProductionBaseUrl, config.BaseUrl);

        config.Update("usuario", null, null, "300006611", null, null, useQa: true, null,
            "T", "t@t.com", "CUIT", "30712345678", null, "Calle", "1", "CABA", "1425",
            1000, 30, 20, 15, true);
        Assert.Equal(AndreaniConfig.QaBaseUrl, config.BaseUrl);
    }

    [Fact]
    public void UnPaqueteMasGrandeQueUnMetroCubicoSeRechaza()
    {
        // El campo volumenCm de la orden admite hasta 999999,999 cm³. Frenarlo
        // acá da un mensaje que se entiende; dejarlo pasar da un 400 opaco.
        var result = Save(New(), length: 150, width: 100, height: 100);
        Assert.True(result.IsFailure);
        Assert.Equal("Andreani.TooBig", result.Error.Code);
    }

    [Fact]
    public void ElVolumenPorUnidadEsElProductoDeLasTresMedidas()
    {
        var config = New();
        Save(config, length: 30, width: 20, height: 15);
        Assert.Equal(9000, config.UnitVolumeCm);
    }

    [Fact]
    public void EditarSinContrasenaNoLaBorra()
    {
        var config = New();
        Save(config);
        Assert.Equal("cifrada", config.PasswordEncrypted);
    }

    [Fact]
    public void SinDatosDelRemitenteNoSePuedeDespachar()
    {
        var config = New();
        // Cotizar no necesita el remitente; crear la orden sí. El panel lo
        // avisa antes de que falle el primer despacho.
        config.Update("usuario", null, null, "300006611", null, null, false, null,
            null, null, null, null, null, null, null, null, null,
            1000, 30, 20, 15, true);
        Assert.False(config.CanCreateShipments);

        Save(config);
        Assert.True(config.CanCreateShipments);
    }
}

public class AndreaniAforoTests
{
    [Fact]
    public void ElAforoEsElMayorEntrePesoRealYVolumetrico()
    {
        // Medido contra la API real: 9000 cm³ con 1 kg devolvió 3150 g de peso
        // aforado, o sea 0,35 g por cm³. Es lo que Andreani cobra.
        Assert.Equal(3150m, AndreaniClient.AforadoGrams(1m, 9000, AndreaniConfig.DefaultVolumetricFactor));
    }

    [Fact]
    public void ConPocoVolumenGanaElPesoReal()
    {
        // También verificado: 1 kg con 1000 cm³ aforó 1000 g, no 350.
        Assert.Equal(1000m, AndreaniClient.AforadoGrams(1m, 1000, AndreaniConfig.DefaultVolumetricFactor));
    }

    [Fact]
    public void UnBultoPesadoYChicoAforaPorPeso() =>
        Assert.Equal(30000m, AndreaniClient.AforadoGrams(30m, 1, AndreaniConfig.DefaultVolumetricFactor));
}

public class AndreaniStatusMapTests
{
    [Theory]
    [InlineData(1, AndreaniShipmentStatus.Created)]              // Pendiente de ingreso
    [InlineData(5, AndreaniShipmentStatus.Dispatched)]           // Ingreso al circuito operativo
    [InlineData(6, AndreaniShipmentStatus.OutForDelivery)]       // En distribución
    [InlineData(11, AndreaniShipmentStatus.DeliveryAttemptFailed)] // Visita
    public void MapeaLosEstadosConocidos(int stateId, string expected) =>
        Assert.Equal(expected, AndreaniStatusMap.FromTrace(stateId, null));

    [Fact]
    public void UnEstadoDesconocidoSinNombreQuedaEnUnknown() =>
        // Andreani no publica su catálogo: inventar el resto sería adivinar
        // cuándo un pedido está entregado.
        Assert.Equal(AndreaniShipmentStatus.Unknown, AndreaniStatusMap.FromTrace(999, null));

    [Theory]
    [InlineData("Entregado", AndreaniShipmentStatus.Delivered)]
    [InlineData("Disponible para retiro", AndreaniShipmentStatus.AvailableForPickup)]
    [InlineData("Devolución al remitente", AndreaniShipmentStatus.ReturnedToSender)]
    public void ConUnIdDesconocidoIntentaPorElNombre(string name, string expected) =>
        Assert.Equal(expected, AndreaniStatusMap.FromTrace(999, name));

    [Fact]
    public void NuncaSeLeAvisaAlCompradorSobreUnEstadoQueNoEntendemos() =>
        Assert.Null(AndreaniStatusMap.BuyerMessage(AndreaniShipmentStatus.Unknown));

    [Theory]
    [InlineData(AndreaniShipmentStatus.Dispatched)]
    [InlineData(AndreaniShipmentStatus.OutForDelivery)]
    [InlineData(AndreaniShipmentStatus.Delivered)]
    public void LosEstadosQueLeImportanAlCompradorTienenMensaje(string status)
    {
        var message = AndreaniStatusMap.BuyerMessage(status);
        Assert.False(string.IsNullOrWhiteSpace(message));
        // Nunca el texto crudo de Andreani: "Ingreso al circuito operativo" no
        // significa nada para una persona.
        Assert.DoesNotContain("circuito", message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void SoloEntregadoYDevueltoSonFinales()
    {
        Assert.True(AndreaniStatusMap.IsFinal(AndreaniShipmentStatus.Delivered));
        Assert.True(AndreaniStatusMap.IsFinal(AndreaniShipmentStatus.ReturnedToSender));
        Assert.False(AndreaniStatusMap.IsFinal(AndreaniShipmentStatus.OutForDelivery));
        // Un estado desconocido no es final: hay que volver a preguntar.
        Assert.False(AndreaniStatusMap.IsFinal(AndreaniShipmentStatus.Unknown));
    }
}

public class AndreaniShipmentTests
{
    [Fact]
    public void GuardaElNumeroDeTodosLosBultos()
    {
        // Andreani devuelve un número de seguimiento POR BULTO, no uno por
        // envío: el del primero es el que se le muestra al comprador.
        var shipment = AndreaniShipment.Create(
            Guid.NewGuid(), Guid.NewGuid(), "360000000036820",
            ["360000000036820", "360000000036830"],
            "https://apis.andreani.com/v2/360000000036820/etiquetas", "300006611", "BARRACAS");

        Assert.Equal("360000000036820", shipment.TrackingNumber);
        Assert.Equal("360000000036820,360000000036830", shipment.AllTrackingNumbers);
        Assert.Equal(AndreaniShipmentStatus.Created, shipment.Status);
    }

    [Fact]
    public void GuardaElEstadoCrudoJuntoAlTraducido()
    {
        var shipment = AndreaniShipment.Create(
            Guid.NewGuid(), Guid.NewGuid(), "36000", ["36000"], null, "300006611", null);

        shipment.ApplyTracking(AndreaniShipmentStatus.Unknown, "Un estado nuevo", 77);

        // Guardar el crudo es lo que permite ampliar el mapeo después en vez de
        // perder la información.
        Assert.Equal("Un estado nuevo", shipment.RawStatus);
        Assert.Equal(77, shipment.RawStatusId);
    }
}
