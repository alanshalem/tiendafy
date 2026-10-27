using System.Net;
using Checkout.Core.Domain;
using Checkout.Infrastructure.Carriers;
using Microsoft.Extensions.Logging.Abstractions;
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
    [InlineData("En sucursal destino", AndreaniShipmentStatus.AvailableForPickup)]
    [InlineData("Devolución al remitente", AndreaniShipmentStatus.ReturnedToSender)]
    [InlineData("devolucion en curso", AndreaniShipmentStatus.ReturnedToSender)]
    [InlineData("En distribución", AndreaniShipmentStatus.OutForDelivery)]
    [InlineData("En reparto", AndreaniShipmentStatus.OutForDelivery)]
    [InlineData("Visita sin éxito", AndreaniShipmentStatus.DeliveryAttemptFailed)]
    [InlineData("En tránsito a sucursal", AndreaniShipmentStatus.InTransit)]
    [InlineData("En transito", AndreaniShipmentStatus.InTransit)]
    [InlineData("  ", AndreaniShipmentStatus.Unknown)]
    [InlineData("Algo nuevo de Andreani", AndreaniShipmentStatus.Unknown)]
    public void ConUnIdDesconocidoIntentaPorElNombre(string name, string expected) =>
        Assert.Equal(expected, AndreaniStatusMap.FromTrace(999, name));

    [Theory]
    [InlineData(AndreaniShipmentStatus.Created, "Generado")]
    [InlineData(AndreaniShipmentStatus.Dispatched, "Despachado")]
    [InlineData(AndreaniShipmentStatus.InTransit, "En tránsito")]
    [InlineData(AndreaniShipmentStatus.OutForDelivery, "En reparto")]
    [InlineData(AndreaniShipmentStatus.DeliveryAttemptFailed, "Visita fallida")]
    [InlineData(AndreaniShipmentStatus.AvailableForPickup, "En sucursal")]
    [InlineData(AndreaniShipmentStatus.Delivered, "Entregado")]
    [InlineData(AndreaniShipmentStatus.ReturnedToSender, "Devuelto")]
    [InlineData(AndreaniShipmentStatus.Unknown, "Sin novedades")]
    public void CadaEstadoTieneSuEtiquetaEnElPanel(string status, string label) =>
        Assert.Equal(label, AndreaniStatusMap.AdminLabel(status));
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

/// <summary>
/// Las rutas que usa el cliente contra la API real. Sin versión, producción
/// responde 404: crear envíos y consultar trazas no habrían andado nunca.
/// </summary>
public class AndreaniClientRoutesTests
{
    private sealed class Recorder(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        public List<HttpRequestMessage> Sent { get; } = [];

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Sent.Add(request);
            return Task.FromResult(respond(request));
        }
    }

    private static AndreaniConfig Config()
    {
        var config = AndreaniConfig.Create(Guid.NewGuid(), "cifrada").Value;
        config.Update("usuario", null, null, "300006611", null, null, useQa: false, null,
            "Tienda SRL", "ventas@tienda.com", "CUIT", "30712345678", null,
            "Av. Santa Fe", "3253", "C.A.B.A.", "1425", 1000, 30, 20, 15, active: true);
        return config;
    }

    private static HttpResponseMessage Json(string body) =>
        new(HttpStatusCode.OK) { Content = new StringContent(body, System.Text.Encoding.UTF8, "application/json") };

    [Fact]
    public async Task ElLoginEsUnGetConBasicYElTokenVuelveEnElHeader()
    {
        var handler = new Recorder(_ =>
        {
            var res = new HttpResponseMessage(HttpStatusCode.OK);
            res.Headers.Add("x-authorization-token", "tok-1");
            return res;
        });
        var client = new AndreaniClient(new HttpClient(handler), NullLogger<AndreaniClient>.Instance);

        Assert.Equal("tok-1", await client.LoginAsync(Config(), "clave", CancellationToken.None));

        var sent = Assert.Single(handler.Sent);
        Assert.Equal(HttpMethod.Get, sent.Method);
        Assert.Equal("https://apis.andreani.com/login", sent.RequestUri!.ToString());
        Assert.Equal("Basic", sent.Headers.Authorization?.Scheme);
    }

    [Fact]
    public async Task SinElHeaderElTokenSeLeeDelCuerpo()
    {
        var client = new AndreaniClient(new HttpClient(new Recorder(_ => Json("""{"token":"tok-2"}"""))),
            NullLogger<AndreaniClient>.Instance);
        Assert.Equal("tok-2", await client.LoginAsync(Config(), "clave", CancellationToken.None));
    }

    [Fact]
    public async Task LaOrdenDeEnvioVaAV2()
    {
        var handler = new Recorder(_ => Json("""{"bultos":[{"numeroDeEnvio":"360000000036820"}]}"""));
        var client = new AndreaniClient(new HttpClient(handler), NullLogger<AndreaniClient>.Instance);

        var created = await client.CreateShipmentAsync(Config(), "tok", new { contrato = "300006611" }, CancellationToken.None);

        Assert.Equal("360000000036820", created.TrackingNumber);
        var sent = Assert.Single(handler.Sent);
        Assert.Equal(HttpMethod.Post, sent.Method);
        Assert.Equal("https://apis.andreani.com/v2/ordenes-de-envio", sent.RequestUri!.ToString());
        Assert.Equal("tok", sent.Headers.GetValues("x-authorization-token").Single());
    }

    private sealed class ListLogger<T> : Microsoft.Extensions.Logging.ILogger<T>
    {
        public List<string> Messages { get; } = [];

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(Microsoft.Extensions.Logging.LogLevel logLevel) => true;

        public void Log<TState>(Microsoft.Extensions.Logging.LogLevel logLevel, Microsoft.Extensions.Logging.EventId eventId,
            TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
            Messages.Add(formatter(state, exception));
    }

    [Fact]
    public async Task ElErrorDeLaOrdenNoLogueaDatosPersonalesDelComprador()
    {
        // Andreani suele repetir en el error el destinatario, el documento y el
        // domicilio: el log del servidor no los guarda.
        var handler = new Recorder(_ => new HttpResponseMessage(HttpStatusCode.BadRequest)
        {
            Content = new StringContent(
                """{"message":"Destinatario inválido","email":"juan.perez@gmail.com","documento":"30712345678","token":"abc123secreto"}"""),
        });
        var log = new ListLogger<AndreaniClient>();
        var client = new AndreaniClient(new HttpClient(handler), log);

        await Assert.ThrowsAsync<AndreaniException>(() =>
            client.CreateShipmentAsync(Config(), "tok", new { contrato = "300006611" }, CancellationToken.None));

        var logged = string.Join("\n", log.Messages);
        Assert.Contains("Destinatario inválido", logged, StringComparison.Ordinal);
        Assert.DoesNotContain("juan.perez", logged, StringComparison.Ordinal);
        Assert.DoesNotContain("30712345678", logged, StringComparison.Ordinal);
        Assert.DoesNotContain("abc123secreto", logged, StringComparison.Ordinal);
    }

    [Fact]
    public async Task LasTrazasVanAV2ConElNumeroDeEnvio()
    {
        var handler = new Recorder(_ => Json(
            """{"eventos":[{"Fecha":"2026-10-01T10:00:00","EstadoId":6,"Estado":"En distribución"}]}"""));
        var client = new AndreaniClient(new HttpClient(handler), NullLogger<AndreaniClient>.Instance);

        var events = await client.GetTracesAsync(Config(), "tok", "360000000036820", CancellationToken.None);

        Assert.Equal(6, Assert.Single(events).StateId);
        var sent = Assert.Single(handler.Sent);
        Assert.Equal(HttpMethod.Get, sent.Method);
        Assert.Equal("https://apis.andreani.com/v2/envios/360000000036820/trazas", sent.RequestUri!.ToString());
    }
}
