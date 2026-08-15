using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Checkout.Core.Domain;

namespace Api.Shipping;

/// <summary>Error controlado de la API de Zipnova, con el mensaje del server.</summary>
public sealed class ZipnovaException(string message, HttpStatusCode? status = null)
    : CarrierException(message, status);

public sealed record ZipnovaCredentials(string ApiToken, string ApiSecret, string Country)
{
    public string BaseUrl => Country switch
    {
        "CL" => "https://api.zipnova.cl/v2",
        "MX" => "https://api.zipnova.com.mx/v2",
        _ => "https://api.zipnova.com.ar/v2",
    };
}

// ---- Wire types de la cotización (POST /shipments/quote) --------------------

public sealed record ZipnovaCarrier(
    [property: JsonPropertyName("id")] int Id,
    [property: JsonPropertyName("name")] string? Name);

public sealed record ZipnovaServiceType(
    [property: JsonPropertyName("id")] int Id,
    [property: JsonPropertyName("code")] string? Code,
    [property: JsonPropertyName("name")] string? Name);

public sealed record ZipnovaAmounts(
    [property: JsonPropertyName("price")] decimal Price,
    [property: JsonPropertyName("price_incl_tax")] decimal PriceInclTax);

public sealed record ZipnovaDeliveryTime(
    [property: JsonPropertyName("estimated_delivery")] string? EstimatedDelivery);

public sealed record ZipnovaQuoteResult(
    [property: JsonPropertyName("selectable")] bool Selectable,
    [property: JsonPropertyName("logistic_type")] string? LogisticType,
    [property: JsonPropertyName("carrier")] ZipnovaCarrier? Carrier,
    [property: JsonPropertyName("service_type")] ZipnovaServiceType? ServiceType,
    [property: JsonPropertyName("delivery_time")] ZipnovaDeliveryTime? DeliveryTime,
    [property: JsonPropertyName("amounts")] ZipnovaAmounts? Amounts);

public sealed record ZipnovaQuoteResponse(
    [property: JsonPropertyName("all_results")] List<ZipnovaQuoteResult>? AllResults);

// ---- Wire types de la creación (POST /shipments) ----------------------------

public sealed record ZipnovaShipmentCarrier(
    [property: JsonPropertyName("id")] int Id,
    [property: JsonPropertyName("name")] string? Name);

public sealed record ZipnovaShipmentResponse(
    [property: JsonPropertyName("id")] long Id,
    [property: JsonPropertyName("external_id")] string? ExternalId,
    [property: JsonPropertyName("carrier_tracking_id")] string? CarrierTrackingId,
    [property: JsonPropertyName("carrier")] ZipnovaShipmentCarrier? Carrier,
    [property: JsonPropertyName("status")] string? Status,
    [property: JsonPropertyName("status_name")] string? StatusName,
    [property: JsonPropertyName("tracking")] string? TrackingUrl,
    [property: JsonPropertyName("tracking_external")] string? TrackingExternalUrl,
    [property: JsonPropertyName("price_incl_tax")] decimal? PriceInclTax);

public sealed record ZipnovaTrackingEvent(
    [property: JsonPropertyName("status")] string? Status,
    [property: JsonPropertyName("status_name")] string? StatusName,
    [property: JsonPropertyName("created_at")] string? CreatedAt,
    [property: JsonPropertyName("description")] string? Description);

/// <summary>
/// Cliente de la API v2 de Zipnova. Autenticación Basic (API Token + Secret
/// de la cuenta de la tienda). Reglas duras confirmadas por soporte de
/// Zipnova por escrito (jul-2026):
/// - La creación de envíos NO tiene idempotencia del lado de Zipnova (un
///   external_id repetido DUPLICA el envío): acá NUNCA se reintenta un
///   POST /shipments. El guard local vive en ZipnovaShipment.
/// - Dimensiones en CM en TODOS los endpoints (la spec pública decía mm en
///   la creación; soporte lo desmintió — no convertir nunca).
/// - Pruebas: no hay ambiente aparte; se pide a soporte habilitar la
///   modalidad "testing" sobre la cuenta registrada.
/// - Rate limits por IP (500/min cotización, 100/min creación).
/// </summary>
public sealed class ZipnovaClient(HttpClient http, ILogger<ZipnovaClient> logger)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private HttpRequestMessage Build(ZipnovaCredentials creds, HttpMethod method, string path, object? payload)
    {
        var request = new HttpRequestMessage(method, $"{creds.BaseUrl}{path}");
        var basic = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{creds.ApiToken}:{creds.ApiSecret}"));
        request.Headers.Authorization = new AuthenticationHeaderValue("Basic", basic);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        if (payload is not null)
            request.Content = new StringContent(JsonSerializer.Serialize(payload, Json), Encoding.UTF8, "application/json");
        return request;
    }

    private async Task<string> SendAsync(ZipnovaCredentials creds, HttpMethod method, string path, object? payload, CancellationToken ct)
    {
        using var request = Build(creds, method, path, payload);
        using var response = await http.SendAsync(request, ct);
        var body = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
        {
            logger.LogWarning("Zipnova {Path} devolvió {Status}: {Body}",
                Logging.LogValue.Safe(path), (int)response.StatusCode, Logging.LogValue.Safe(body, 300));
            throw new ZipnovaException(ExtractMessage(body, response.StatusCode), response.StatusCode);
        }
        return body;
    }

    /// <summary>POST /shipments/quote — dimensiones en CM (contrato de esa página).</summary>
    public async Task<ZipnovaQuoteResponse> QuoteAsync(
        ZipnovaCredentials creds, ZipnovaConfig config,
        string city, string state, string zipcode, int units, decimal declaredValue, CancellationToken ct)
    {
        var package = new
        {
            weight = config.DefaultWeightGrams,
            height = config.DefaultHeightCm,
            width = config.DefaultWidthCm,
            length = config.DefaultLengthCm,
            classification_id = "1",
            description_1 = "Pedido de tienda online",
        };
        var payload = new Dictionary<string, object?>
        {
            // sort_by y destino explícitos: la spec no documenta defaults y el
            // resultado debe ser reproducible.
            ["account_id"] = config.AccountId,
            ["source"] = "tiendafy",
            ["declared_value"] = declaredValue,
            ["sort_by"] = "price",
            ["destination"] = new { city, state, zipcode },
            // N unidades = N paquetes iguales (items[] no tiene quantity).
            ["packages"] = Enumerable.Repeat(package, units).ToArray(),
        };
        if (config.OriginId != "auto" && int.TryParse(config.OriginId, out var originId))
            payload["origin_id"] = originId;

        var body = await SendAsync(creds, HttpMethod.Post, "/shipments/quote", payload, ct);
        return JsonSerializer.Deserialize<ZipnovaQuoteResponse>(body, Json)
            ?? throw new ZipnovaException("Respuesta de cotización vacía.");
    }

    /// <summary>
    /// POST /shipments — dimensiones en CM (confirmado por soporte; la spec
    /// pública decía mm). SIN reintentos: Zipnova no deduplica.
    /// </summary>
    public async Task<ZipnovaShipmentResponse> CreateShipmentAsync(
        ZipnovaCredentials creds, object payload, CancellationToken ct)
    {
        var body = await SendAsync(creds, HttpMethod.Post, "/shipments", payload, ct);
        return JsonSerializer.Deserialize<ZipnovaShipmentResponse>(body, Json)
            ?? throw new ZipnovaException("Respuesta de creación vacía.");
    }

    /// <summary>
    /// GET /shipments/{id}/label.pdf — devuelve los bytes del PDF. El contrato
    /// no declara media type: puede venir binario directo o JSON con base64;
    /// se soportan ambas formas.
    /// </summary>
    public async Task<byte[]> GetLabelPdfAsync(ZipnovaCredentials creds, long shipmentId, CancellationToken ct)
    {
        using var request = Build(creds, HttpMethod.Get, $"/shipments/{shipmentId}/label.pdf?no_status_change=1", null);
        using var response = await http.SendAsync(request, ct);
        if (response.StatusCode == HttpStatusCode.Conflict)
            throw new ZipnovaException("La etiqueta todavía no está disponible. Probá de nuevo en unos minutos.", response.StatusCode);
        if (!response.IsSuccessStatusCode)
        {
            var errorBody = await response.Content.ReadAsStringAsync(ct);
            throw new ZipnovaException(ExtractMessage(errorBody, response.StatusCode), response.StatusCode);
        }

        var bytes = await response.Content.ReadAsByteArrayAsync(ct);
        // %PDF → binario directo. Si no, JSON {"content": "<base64>"} o base64 pelado.
        if (bytes.Length > 4 && bytes[0] == '%' && bytes[1] == 'P' && bytes[2] == 'D' && bytes[3] == 'F')
            return bytes;
        var text = Encoding.UTF8.GetString(bytes).Trim();
        try
        {
            using var doc = JsonDocument.Parse(text);
            if (doc.RootElement.ValueKind == JsonValueKind.Object)
                foreach (var name in new[] { "content", "data", "document", "file" })
                    if (doc.RootElement.TryGetProperty(name, out var prop) && prop.ValueKind == JsonValueKind.String)
                        return Convert.FromBase64String(prop.GetString()!);
            if (doc.RootElement.ValueKind == JsonValueKind.String)
                return Convert.FromBase64String(doc.RootElement.GetString()!);
        }
        catch (JsonException) { /* no era JSON: probar base64 directo */ }
        try
        {
            return Convert.FromBase64String(text);
        }
        catch (FormatException)
        {
            throw new ZipnovaException("Formato de etiqueta no reconocido.");
        }
    }

    /// <summary>GET /shipments/{id}/tracking — historial de estados.</summary>
    public async Task<IReadOnlyList<ZipnovaTrackingEvent>> GetTrackingAsync(
        ZipnovaCredentials creds, long shipmentId, CancellationToken ct)
    {
        var body = await SendAsync(creds, HttpMethod.Get, $"/shipments/{shipmentId}/tracking", null, ct);
        using var doc = JsonDocument.Parse(body);
        var root = doc.RootElement;
        // Puede venir array pelado o envuelto en data[].
        var array = root.ValueKind == JsonValueKind.Array ? root
            : root.TryGetProperty("data", out var data) && data.ValueKind == JsonValueKind.Array ? data
            : default;
        if (array.ValueKind != JsonValueKind.Array) return [];
        return JsonSerializer.Deserialize<List<ZipnovaTrackingEvent>>(array.GetRawText(), Json) ?? [];
    }

    /// <summary>POST /shipments/{id}/cancel.</summary>
    public Task CancelAsync(ZipnovaCredentials creds, long shipmentId, CancellationToken ct) =>
        SendAsync(creds, HttpMethod.Post, $"/shipments/{shipmentId}/cancel", new { }, ct);

    private static string ExtractMessage(string body, HttpStatusCode status)
    {
        var msg = CarrierErrorBody.Message(body, "message", "error");
        if (msg is not null) return $"Zipnova: {msg}";
        return status == HttpStatusCode.TooManyRequests
            ? "Zipnova está limitando el tráfico. Probá de nuevo en un par de minutos."
            : $"Zipnova devolvió {(int)status}.";
    }
}
