using System.Net;
using System.Text.Json;
using SharedKernel.Common;

namespace Checkout.Infrastructure.Carriers;

/// <summary>Error controlado de la API de un carrier, con el mensaje del server.</summary>
public abstract class CarrierException(string message, HttpStatusCode? status = null)
    : ExternalApiException(message, status);

/// <summary>
/// El carrier no contestó (timeout, red caída) o mandó algo que no se pudo
/// leer. Es una falla del proveedor, igual que un error de su API: al cotizar,
/// ese carrier no ofrece opción; en el panel, un mensaje que se entiende en vez
/// de un 500.
///
/// <para>
/// Si el que cortó fue quien hizo el pedido (cerró la página), no cuenta: eso
/// no es una falla de nadie. Y crear un envío NO pasa por acá: ahí "no
/// respondió" puede querer decir que el envío se creó igual, y lo maneja
/// <c>ShipmentWriteAhead</c>.
/// </para>
/// </summary>
public static class CarrierNoAnswer
{
    public static bool Is(Exception ex, CancellationToken requestAborted) =>
        ex is HttpRequestException or JsonException
        || (ex is OperationCanceledException && !requestAborted.IsCancellationRequested);

    /// <summary>Lo que se le dice al comercio: sin "timeout" ni códigos.</summary>
    public static string Message(string carrierName) =>
        $"{carrierName} no respondió a tiempo. Probá de nuevo en unos minutos.";
}
