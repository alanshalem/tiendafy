using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SharedKernel.Common;

namespace MercadoLibre.Infrastructure;

/// <summary>Error controlado de la API de Mercado Libre, con el mensaje del server.</summary>
public sealed class MeliException(string message, HttpStatusCode? status = null)
    : ExternalApiException(message, status);

public sealed record MeliTokens(
    string AccessToken, string RefreshToken, long UserId, int ExpiresInSeconds);

/// <summary>
/// Cliente HTTP de la API de Mercado Libre. Reglas duras del proveedor:
/// - Access token ~6 hs; el refresh token es DE UN SOLO USO (rota en cada
///   refresh) → la renovación la serializa MeliTokenService, nunca acá.
/// - Rate limit ~1500 req/min por vendedor.
/// - Los webhooks no traen datos: siempre se re-consulta el resource.
/// Devuelve JsonDocument crudo: el shape de ML es enorme y los endpoints
/// proyectan solo lo que el panel usa (KISS: cero DTOs espejo).
/// </summary>
public sealed class MeliClient(HttpClient http, IOptions<MeliOptions> options, ILogger<MeliClient> logger)
{
    private readonly MeliOptions _o = options.Value;

    public string BuildAuthorizationUrl(string state)
    {
        // ML es el único cuyo endpoint de authorize cuelga de la base (+/authorization).
        return OAuth2.BuildAuthorizationUrl($"{_o.AuthBaseUrl.TrimEnd('/')}/authorization", new Dictionary<string, string>
        {
            ["response_type"] = "code",
            ["client_id"] = _o.ClientId,
            ["redirect_uri"] = _o.RedirectUri,
            ["state"] = state,
        });
    }

    public Task<MeliTokens> ExchangeCodeAsync(string code, CancellationToken ct) =>
        PostTokenAsync(OAuth2.AuthorizationCodeGrant(_o.ClientId, _o.ClientSecret, code, _o.RedirectUri), ct);

    public Task<MeliTokens> RefreshAsync(string refreshToken, CancellationToken ct) =>
        PostTokenAsync(OAuth2.RefreshTokenGrant(_o.ClientId, _o.ClientSecret, refreshToken), ct);

    private async Task<MeliTokens> PostTokenAsync(Dictionary<string, string> form, CancellationToken ct)
    {
        var (status, ok, body) = await OAuth2.PostTokenAsync(http, _o.ApiBaseUrl, form, ct);
        if (!ok)
        {
            logger.LogWarning("Mercado Libre OAuth devolvió {Status}: {Body}",
                (int)status, LogValue.Safe(body, 300));
            throw new MeliException(ExtractMessage(body, status), status);
        }

        using var doc = JsonDocument.Parse(body);
        var root = doc.RootElement;
        return new MeliTokens(
            AccessToken: root.GetProperty("access_token").GetString()
                ?? throw new MeliException("Respuesta OAuth sin access_token."),
            RefreshToken: JsonRead.GetString(root, "refresh_token") ?? string.Empty,
            UserId: JsonRead.GetLong(root, "user_id"),
            ExpiresInSeconds: root.TryGetProperty("expires_in", out var ex) && ex.ValueKind == JsonValueKind.Number ? ex.GetInt32() : 21600);
    }

    /// <param name="headers">Cabeceras extra del pedido (p. ej. <c>x-format-new</c> de <c>/shipments</c>).</param>
    public Task<JsonDocument> GetAsync(
        string accessToken, string path, CancellationToken ct, IReadOnlyDictionary<string, string>? headers = null) =>
        SendAsync(accessToken, HttpMethod.Get, path, null, ct, headers);

    public Task<JsonDocument> PostAsync(string accessToken, string path, object payload, CancellationToken ct) =>
        SendAsync(accessToken, HttpMethod.Post, path, payload, ct);

    public Task<JsonDocument> PutAsync(string accessToken, string path, object payload, CancellationToken ct) =>
        SendAsync(accessToken, HttpMethod.Put, path, payload, ct);

    private async Task<JsonDocument> SendAsync(
        string accessToken, HttpMethod method, string path, object? payload, CancellationToken ct,
        IReadOnlyDictionary<string, string>? headers = null)
    {
        using var request = new HttpRequestMessage(method, $"{_o.ApiBaseUrl.TrimEnd('/')}{path}");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        if (headers is not null)
        {
            foreach (var (name, value) in headers)
            {
                // La autorización y el formato de respuesta son del cliente: una cabecera extra no los pisa.
                if (name.Equals("Authorization", StringComparison.OrdinalIgnoreCase)
                    || name.Equals("Accept", StringComparison.OrdinalIgnoreCase))
                    throw new ArgumentException($"La cabecera {name} la fija el cliente de Mercado Libre.", nameof(headers));
                request.Headers.TryAddWithoutValidation(name, value);
            }
        }
        if (payload is not null)
            request.Content = new StringContent(JsonSerializer.Serialize(payload, JsonDefaults.Web), Encoding.UTF8, "application/json");

        using var response = await http.SendAsync(request, ct);
        var body = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
        {
            logger.LogWarning("Mercado Libre {Method} {Path} devolvió {Status}: {Body}",
                method.Method, LogValue.Safe(path, 120), (int)response.StatusCode, LogValue.Safe(body, 300));
            throw new MeliException(ExtractMessage(body, response.StatusCode), response.StatusCode);
        }
        return JsonDocument.Parse(string.IsNullOrWhiteSpace(body) ? "{}" : body);
    }

    private static string ExtractMessage(string body, HttpStatusCode status)
    {
        var msg = ExternalErrorBody.Message(body, "message");
        if (msg is not null) return $"Mercado Libre: {msg}";
        return status == HttpStatusCode.TooManyRequests
            ? "Mercado Libre está limitando el tráfico. Probá de nuevo en un minuto."
            : $"Mercado Libre devolvió {(int)status}.";
    }
}
