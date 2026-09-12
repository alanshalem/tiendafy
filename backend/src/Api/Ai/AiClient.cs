using System.Text.Json;
using SharedKernel.Common;

namespace Api.Ai;

/// <summary>
/// Credenciales de PLATAFORMA para las sugerencias con IA (Claude API).
/// Sin API key, los botones "Sugerir" no aparecen — mismo gating que el resto
/// de las integraciones (vacío = apagado).
/// </summary>
public sealed class AiOptions
{
    public const string SectionName = "Ai";

    public string ApiKey { get; set; } = string.Empty;
    public string Model { get; set; } = "claude-sonnet-5";
    public string ApiBaseUrl { get; set; } = "https://api.anthropic.com";
    public bool Configured => !string.IsNullOrWhiteSpace(ApiKey);
}

/// <summary>
/// Cliente mínimo de la Claude API (Messages) para las sugerencias del panel:
/// respuestas a preguntas de ML, posts para redes y descripciones de producto.
/// Los prompts se arman SERVER-SIDE — el browser solo manda el contexto.
/// </summary>
public sealed class AiClient(HttpClient http, Microsoft.Extensions.Options.IOptions<AiOptions> options, ILogger<AiClient> logger)
{
    private readonly AiOptions _o = options.Value;

    public bool Configured => _o.Configured;

    public Task<Result<string>> CompleteAsync(string system, string prompt, int maxTokens, CancellationToken ct) =>
        SendAsync(system, [new { type = "text", text = prompt }], maxTokens, ct);

    /// <summary>
    /// Igual, pero con un archivo adjunto: un PDF o una foto. Lo usa la lectura
    /// de facturas de compra — el contenido va en el mismo mensaje que la
    /// consigna, que es como el modelo puede mirarlo mientras responde.
    ///
    /// Los bytes se mandan en base64 y no se guardan en ningún lado: el archivo
    /// entra, sale la propuesta, y lo que queda registrado es lo que la persona
    /// terminó confirmando.
    /// </summary>
    public Task<Result<string>> CompleteWithFileAsync(
        string system, string prompt, byte[] file, string mediaType, int maxTokens, CancellationToken ct)
    {
        var data = Convert.ToBase64String(file);
        var source = new { type = "base64", media_type = mediaType, data };
        object attachment = mediaType == "application/pdf"
            ? new { type = "document", source }
            : new { type = "image", source };

        // El archivo primero: el modelo lee mejor la consigna sabiendo ya qué
        // tiene delante.
        return SendAsync(system, [attachment, new { type = "text", text = prompt }], maxTokens, ct);
    }

    private async Task<Result<string>> SendAsync(
        string system, object[] blocks, int maxTokens, CancellationToken ct)
    {
        if (!_o.Configured)
            return Result.Failure<string>(new Error("Ai.NotConfigured", "La IA no está configurada en esta plataforma."));

        using var request = new HttpRequestMessage(HttpMethod.Post, $"{_o.ApiBaseUrl}/v1/messages");
        request.Headers.Add("x-api-key", _o.ApiKey);
        request.Headers.Add("anthropic-version", "2023-06-01");
        request.Content = new StringContent(JsonSerializer.Serialize(new
        {
            model = _o.Model,
            max_tokens = maxTokens,
            system,
            messages = new[] { new { role = "user", content = blocks } },
        }), System.Text.Encoding.UTF8, "application/json");

        using var response = await http.SendAsync(request, ct);
        var json = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
        {
            logger.LogWarning("Claude API {Status}: {Body}", (int)response.StatusCode, Text.Clip(json, 400));
            return Result.Failure<string>(new Error("Ai.Failed", "La IA no pudo generar la sugerencia."));
        }

        using var doc = JsonDocument.Parse(json);
        var text = doc.RootElement.TryGetProperty("content", out var content)
            && content.ValueKind == JsonValueKind.Array && content.GetArrayLength() > 0
            ? JsonRead.GetString(content[0], "text")
            : null;
        return string.IsNullOrWhiteSpace(text)
            ? Result.Failure<string>(new Error("Ai.Empty", "La IA devolvió una respuesta vacía."))
            : text.Trim();
    }
}
