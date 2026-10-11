using System.Net;
using System.Text.Json;

namespace SharedKernel.Common;

/// <summary>
/// Error controlado de una API externa (carriers, Mercado Libre), con el
/// mensaje del server y el status HTTP. Base de las excepciones tipadas por
/// integración.
/// </summary>
public abstract class ExternalApiException(string message, HttpStatusCode? status = null) : Exception(message)
{
    public HttpStatusCode? Status { get; } = status;
}

/// <summary>Lectura del cuerpo de error JSON que devuelven las APIs externas.</summary>
public static class ExternalErrorBody
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
