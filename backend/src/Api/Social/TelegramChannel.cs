using System.Text.Json;
using Microsoft.Extensions.Options;
using SharedKernel.Common;
using Social.Contracts;

namespace Api.Social;

/// <summary>
/// Telegram: sin OAuth — cada tienda usa su propio bot (token + chat destino,
/// cargados por formulario y validados con getChat). Publica con sendMessage /
/// sendPhoto / sendMediaGroup según cantidad de imágenes. Si el canal es
/// público (tiene username) la URL externa es t.me/{username}/{message_id}.
/// </summary>
public sealed class TelegramChannel(HttpClient http, IOptions<SocialOptions> options, ILogger<TelegramChannel> logger)
    : ISocialChannel
{
    private readonly SocialOptions.TelegramSection _o = options.Value.Telegram;

    public string Key => "telegram";
    public string DisplayName => "Telegram";
    public SocialChannelLimits Limits => new(MaxChars: 4096, MaxImages: 10, RequiresMedia: false);

    public async Task<SocialPublishResult> PublishAsync(
        string tokenJson, string? dataJson, string text, IReadOnlyList<string> mediaUrls, CancellationToken ct)
    {
        var botToken = SocialTokenService.TokenField(tokenJson, "bot_token");
        var chatId = SocialTokenService.TokenField(tokenJson, "chat_id");
        if (string.IsNullOrEmpty(botToken) || string.IsNullOrEmpty(chatId))
            return SocialPublishResult.Unauthorized();

        // El caption de las fotos tolera menos que un mensaje: texto largo va aparte.
        var captionFits = text.Length <= 1024;
        object payload = mediaUrls.Count switch
        {
            0 => new { chat_id = chatId, text },
            1 => new { chat_id = chatId, photo = mediaUrls[0], caption = captionFits ? text : "" },
            _ => new
            {
                chat_id = chatId,
                media = mediaUrls.Take(Limits.MaxImages)
                    .Select((url, i) => new { type = "photo", media = url, caption = i == 0 && captionFits ? text : "" })
                    .ToArray(),
            },
        };
        var method = mediaUrls.Count switch { 0 => "sendMessage", 1 => "sendPhoto", _ => "sendMediaGroup" };

        var result = await CallAsync(botToken, method, payload, ct);
        if (result.Error is not null) return result.Error;

        // Con foto y texto largo, el texto sale como mensaje aparte (mejor que truncar).
        if (mediaUrls.Count > 0 && !captionFits && text.Length > 0)
        {
            var follow = await CallAsync(botToken, "sendMessage", new { chat_id = chatId, text }, ct);
            if (follow.Error is not null) return follow.Error;
        }

        // sendMediaGroup devuelve array; el primer mensaje representa el post.
        var root = result.Root;
        var message = root.ValueKind == JsonValueKind.Array && root.GetArrayLength() > 0 ? root[0] : root;
        long? messageId = message.ValueKind == JsonValueKind.Object &&
            message.TryGetProperty("message_id", out var mid) && mid.ValueKind == JsonValueKind.Number
            ? mid.GetInt64()
            : null;
        string? username = message.ValueKind == JsonValueKind.Object && message.TryGetProperty("chat", out var chat)
            ? JsonRead.GetString(chat, "username")
            : null;
        var url = messageId is not null && !string.IsNullOrEmpty(username)
            ? $"https://t.me/{username}/{messageId}"
            : null;
        return SocialPublishResult.Ok(messageId?.ToString(), url);
    }

    /// <summary>Valida bot + chat al conectar (endpoint del formulario). Devuelve el chat como candidato.</summary>
    public async Task<Result<SocialAccountCandidate>> ValidateConnectionAsync(string botToken, string chatId, CancellationToken ct)
    {
        var result = await CallAsync(botToken, "getChat", new { chat_id = chatId }, ct);
        if (result.Error is not null)
            return Result.Failure<SocialAccountCandidate>(Error.Validation(
                "Social.TelegramChat", result.Error.Message ?? "Telegram rechazó el bot o el chat."));

        var chat = result.Root;
        var id = chat.TryGetProperty("id", out var i) && i.ValueKind == JsonValueKind.Number
            ? i.GetInt64().ToString()
            : chatId;
        var username = JsonRead.GetString(chat, "username");
        var name = JsonRead.GetString(chat, "title")
            ?? (username is { } u ? $"@{u}" : JsonRead.GetString(chat, "first_name") ?? "Telegram");
        return new SocialAccountCandidate(
            Key, id, name, username, AvatarUrl: null,
            TokenJson: JsonSerializer.Serialize(new { bot_token = botToken, chat_id = id }));
    }

    // ---------------------------------------------------------------- Helpers

    private readonly record struct TelegramResponse(JsonElement Root, SocialPublishResult? Error);

    private async Task<TelegramResponse> CallAsync(string botToken, string method, object payload, CancellationToken ct)
    {
        using var resp = await http.PostAsync($"{_o.ApiBaseUrl}/bot{botToken}/{method}",
            new StringContent(JsonSerializer.Serialize(payload), System.Text.Encoding.UTF8, "application/json"), ct);
        var json = await resp.Content.ReadAsStringAsync(ct);
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        var ok = root.TryGetProperty("ok", out var okProp) && okProp.ValueKind == JsonValueKind.True;
        if (ok && root.TryGetProperty("result", out var res))
            return new TelegramResponse(res.Clone(), null);

        var description = JsonRead.GetString(root, "description") ?? $"Telegram respondió {(int)resp.StatusCode}.";
        logger.LogWarning("Telegram {Method} error {Status}: {Body}", method, (int)resp.StatusCode, Text.Clip(json, 400));
        if ((int)resp.StatusCode is 401 or 403) return new TelegramResponse(default, SocialPublishResult.Unauthorized());
        if ((int)resp.StatusCode == 429)
        {
            var retry = root.TryGetProperty("parameters", out var p) &&
                p.TryGetProperty("retry_after", out var r) && r.ValueKind == JsonValueKind.Number
                ? TimeSpan.FromSeconds(r.GetInt32())
                : TimeSpan.FromMinutes(1);
            return new TelegramResponse(default, new SocialPublishResult(
                SocialPublishStatus.RateLimited, Message: description, RetryAfter: retry));
        }
        return new TelegramResponse(default, SocialPublishResult.Fail(description));
    }
}
