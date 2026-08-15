using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Caching.Memory;

namespace Api.Shipping;

/// <summary>Error controlado de la API de MiCorreo, con el mensaje del server.</summary>
public sealed class MiCorreoException(string message, HttpStatusCode? status = null) : Exception(message)
{
    public HttpStatusCode? Status { get; } = status;
}

public sealed record MiCorreoCredentials(string UserToken, string PasswordToken, string Environment)
{
    public string BaseUrl => string.Equals(Environment, "PROD", StringComparison.OrdinalIgnoreCase)
        ? "https://api.correoargentino.com.ar/micorreo/v1"
        : "https://apitest.correoargentino.com.ar/micorreo/v1";
}

public sealed record MiCorreoRate(
    [property: JsonPropertyName("deliveredType")] string DeliveredType,
    [property: JsonPropertyName("productType")] string ProductType,
    [property: JsonPropertyName("productName")] string ProductName,
    [property: JsonPropertyName("price")] decimal Price,
    [property: JsonPropertyName("deliveryTimeMin")] string? DeliveryTimeMin,
    [property: JsonPropertyName("deliveryTimeMax")] string? DeliveryTimeMax);

public sealed record MiCorreoRatesResponse(
    [property: JsonPropertyName("customerId")] string? CustomerId,
    [property: JsonPropertyName("validTo")] string? ValidTo,
    [property: JsonPropertyName("rates")] List<MiCorreoRate>? Rates);

public sealed record MiCorreoAgencyAddress(
    [property: JsonPropertyName("streetName")] string? StreetName,
    [property: JsonPropertyName("streetNumber")] string? StreetNumber,
    [property: JsonPropertyName("locality")] string? Locality,
    [property: JsonPropertyName("city")] string? City,
    [property: JsonPropertyName("provinceCode")] string? ProvinceCode,
    [property: JsonPropertyName("postalCode")] string? PostalCode);

public sealed record MiCorreoAgencyLocation(
    [property: JsonPropertyName("address")] MiCorreoAgencyAddress? Address);

public sealed record MiCorreoAgencyServices(
    [property: JsonPropertyName("packageReception")] bool PackageReception,
    [property: JsonPropertyName("pickupAvailability")] bool PickupAvailability);

public sealed record MiCorreoAgency(
    [property: JsonPropertyName("code")] string Code,
    [property: JsonPropertyName("name")] string? Name,
    [property: JsonPropertyName("services")] MiCorreoAgencyServices? Services,
    [property: JsonPropertyName("location")] MiCorreoAgencyLocation? Location,
    [property: JsonPropertyName("status")] string? Status);

public sealed record MiCorreoTrackingEvent(
    [property: JsonPropertyName("event")] string? Event,
    [property: JsonPropertyName("date")] string? Date,
    [property: JsonPropertyName("branch")] string? Branch,
    [property: JsonPropertyName("status")] string? Status);

public sealed record MiCorreoTracking(
    [property: JsonPropertyName("trackingNumber")] string? TrackingNumber,
    [property: JsonPropertyName("events")] List<MiCorreoTrackingEvent>? Events);

/// <summary>
/// Cliente de la API MiCorreo de Correo Argentino. Maneja el flujo de auth
/// Basic → JWT con cache en memoria (el token dura ~2,5 h; se renueva con
/// margen y se reintenta UNA vez ante 401). Las credenciales son por tienda
/// y llegan ya descifradas en cada llamada — acá no se persiste nada.
/// </summary>
public sealed class MiCorreoClient(HttpClient http, IMemoryCache cache, ILogger<MiCorreoClient> logger)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    // -------------------------------------------------------------- Auth

    private async Task<string> GetJwtAsync(MiCorreoCredentials creds, bool forceRefresh, CancellationToken ct)
    {
        // La clave de cache no incluye el token en claro: hash corto.
        var cacheKey = $"micorreo:jwt:{creds.Environment}:{creds.UserToken.GetHashCode():x8}";
        if (!forceRefresh && cache.TryGetValue<string>(cacheKey, out var cached) && cached is not null)
            return cached;

        using var request = new HttpRequestMessage(HttpMethod.Post, $"{creds.BaseUrl}/token");
        var basic = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{creds.UserToken}:{creds.PasswordToken}"));
        request.Headers.Authorization = new AuthenticationHeaderValue("Basic", basic);

        using var response = await http.SendAsync(request, ct);
        var body = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
            throw new MiCorreoException(
                response.StatusCode == HttpStatusCode.Unauthorized
                    ? "Credenciales de MiCorreo inválidas (userToken/passwordToken)."
                    : ExtractMessage(body, "No se pudo autenticar con MiCorreo."),
                response.StatusCode);

        using var doc = JsonDocument.Parse(body);
        var token = doc.RootElement.TryGetProperty("token", out var t) ? t.GetString() : null;
        if (string.IsNullOrEmpty(token))
            throw new MiCorreoException("MiCorreo no devolvió el token de autenticación.");

        // "expires": "2022-04-26 21:16:20" (hora del server). Usamos TTL fijo
        // conservador en vez de parsear husos: 30 min << vigencia real (~2,5 h).
        cache.Set(cacheKey, token, TimeSpan.FromMinutes(30));
        return token;
    }

    /// <summary>Ejecuta una llamada autenticada; ante 401 refresca el JWT y reintenta una vez.</summary>
    private async Task<string> SendAsync(
        MiCorreoCredentials creds, HttpMethod method, string path, object? payload, CancellationToken ct)
    {
        for (var attempt = 0; ; attempt++)
        {
            var jwt = await GetJwtAsync(creds, forceRefresh: attempt > 0, ct);
            using var request = new HttpRequestMessage(method, $"{creds.BaseUrl}{path}");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", jwt);
            if (payload is not null)
                request.Content = new StringContent(JsonSerializer.Serialize(payload, Json), Encoding.UTF8, "application/json");

            using var response = await http.SendAsync(request, ct);
            var body = await response.Content.ReadAsStringAsync(ct);

            if (response.StatusCode == HttpStatusCode.Unauthorized && attempt == 0)
                continue; // JWT vencido → refresh + único reintento.

            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning("MiCorreo {Path} devolvió {Status}: {Body}",
                    Logging.LogValue.Safe(path), (int)response.StatusCode, Logging.LogValue.Safe(body, 300));
                throw new MiCorreoException(ExtractMessage(body, $"MiCorreo devolvió {(int)response.StatusCode}."), response.StatusCode);
            }

            return body;
        }
    }

    // ---------------------------------------------------------- Operaciones

    /// <summary>POST /users/validate — email+password de MiCorreo → customerId. No se persiste nada de esto.</summary>
    public async Task<string> ValidateUserAsync(MiCorreoCredentials creds, string email, string password, CancellationToken ct)
    {
        var body = await SendAsync(creds, HttpMethod.Post, "/users/validate", new { email, password }, ct);
        using var doc = JsonDocument.Parse(body);
        var id = doc.RootElement.TryGetProperty("customerId", out var c) ? c.GetString() : null;
        return string.IsNullOrEmpty(id)
            ? throw new MiCorreoException("MiCorreo no devolvió el customerId.")
            : id;
    }

    /// <summary>POST /rates — cotiza a domicilio y a sucursal en una sola llamada.</summary>
    public async Task<MiCorreoRatesResponse> GetRatesAsync(
        MiCorreoCredentials creds, string customerId, string originPostalCode, string destinationPostalCode,
        CorreoPackage package, CancellationToken ct)
    {
        var payload = new
        {
            customerId,
            postalCodeOrigin = originPostalCode,
            postalCodeDestination = destinationPostalCode,
            dimensions = new
            {
                weight = package.WeightGrams,
                height = package.HeightCm,
                width = package.WidthCm,
                length = package.LengthCm,
            },
        };
        var body = await SendAsync(creds, HttpMethod.Post, "/rates", payload, ct);
        return JsonSerializer.Deserialize<MiCorreoRatesResponse>(body, Json)
            ?? throw new MiCorreoException("Respuesta de cotización vacía.");
    }

    /// <summary>GET /agencies — sucursales de una provincia, cacheadas 12 h (cambian poco).</summary>
    public async Task<IReadOnlyList<MiCorreoAgency>> GetAgenciesAsync(
        MiCorreoCredentials creds, string customerId, string provinceCode, CancellationToken ct)
    {
        var cacheKey = $"micorreo:agencies:{creds.Environment}:{provinceCode}";
        if (cache.TryGetValue<IReadOnlyList<MiCorreoAgency>>(cacheKey, out var cached) && cached is not null)
            return cached;

        var body = await SendAsync(creds, HttpMethod.Get,
            $"/agencies?provinceCode={Uri.EscapeDataString(provinceCode)}&customerId={Uri.EscapeDataString(customerId)}",
            payload: null, ct);
        var agencies = JsonSerializer.Deserialize<List<MiCorreoAgency>>(body, Json) ?? [];

        // Solo sirven las activas que reciben paquetes.
        IReadOnlyList<MiCorreoAgency> result = agencies
            .Where(a => a.Services?.PackageReception == true
                && !string.Equals(a.Status, "INACTIVE", StringComparison.OrdinalIgnoreCase))
            .ToList();
        cache.Set(cacheKey, result, TimeSpan.FromHours(12));
        return result;
    }

    /// <summary>POST /shipping/import — alta del envío en MiCorreo. Devuelve la fecha de creación.</summary>
    public async Task<string?> ImportShippingAsync(MiCorreoCredentials creds, object payload, CancellationToken ct)
    {
        var body = await SendAsync(creds, HttpMethod.Post, "/shipping/import", payload, ct);
        using var doc = JsonDocument.Parse(body);
        return doc.RootElement.TryGetProperty("createdAt", out var c) ? c.GetString() : null;
    }

    /// <summary>GET /shipping/tracking — eventos de seguimiento de un envío.</summary>
    public async Task<IReadOnlyList<MiCorreoTracking>> GetTrackingAsync(
        MiCorreoCredentials creds, string shippingId, CancellationToken ct)
    {
        var body = await SendAsync(creds, HttpMethod.Get,
            $"/shipping/tracking?shippingId={Uri.EscapeDataString(shippingId)}", payload: null, ct);

        // El server responde array (con eventos), objeto suelto (sin eventos) o
        // un objeto de error {date, error, code} — normalizamos los tres.
        using var doc = JsonDocument.Parse(body);
        if (doc.RootElement.ValueKind == JsonValueKind.Array)
            return JsonSerializer.Deserialize<List<MiCorreoTracking>>(body, Json) ?? [];
        if (doc.RootElement.TryGetProperty("error", out var err))
            throw new MiCorreoException(err.GetString() ?? "Envío no encontrado en MiCorreo.");
        var single = JsonSerializer.Deserialize<MiCorreoTracking>(body, Json);
        return single is null ? [] : [single];
    }

    // ------------------------------------------------------------ Helpers

    private static string ExtractMessage(string body, string fallback)
    {
        try
        {
            using var doc = JsonDocument.Parse(body);
            var msg = doc.RootElement.TryGetProperty("message", out var m) ? m.GetString() : null;
            return string.IsNullOrWhiteSpace(msg) ? fallback : $"MiCorreo: {msg}";
        }
        catch (JsonException)
        {
            return fallback;
        }
    }

}
