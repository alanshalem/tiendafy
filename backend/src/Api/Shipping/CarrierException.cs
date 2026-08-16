using System.Net;

namespace Api.Shipping;

/// <summary>Error controlado de la API de un carrier, con el mensaje del server.</summary>
public abstract class CarrierException(string message, HttpStatusCode? status = null)
    : ExternalApiException(message, status);
