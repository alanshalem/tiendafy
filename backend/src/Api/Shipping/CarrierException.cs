using System.Net;
using System.Text.Json;

namespace Api.Shipping;

/// <summary>Error controlado de la API de un carrier, con el mensaje del server.</summary>
public abstract class CarrierException(string message, HttpStatusCode? status = null) : Exception(message)
{
    public HttpStatusCode? Status { get; } = status;
}

/// <summary>Lectura del cuerpo de error JSON que devuelven los carriers.</summary>
internal static class CarrierErrorBody
{
    /// <summary>Primer string no vacío entre las propiedades dadas, o null si no hay.</summary>
    public static string? Message(string body, params string[] properties)
    {
        try
        {
            using var doc = JsonDocument.Parse(body);
            if (doc.RootElement.ValueKind != JsonValueKind.Object) return null;
            foreach (var name in properties)
                if (doc.RootElement.TryGetProperty(name, out var m) && m.ValueKind == JsonValueKind.String
                    && !string.IsNullOrWhiteSpace(m.GetString()))
                    return m.GetString();
        }
        catch (JsonException)
        {
            // cuerpo no-JSON
        }
        return null;
    }
}
