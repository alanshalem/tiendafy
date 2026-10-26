using System.ClientModel;
using System.ClientModel.Primitives;
using Ai.Infrastructure;
using Anthropic;
using Microsoft.Extensions.AI;
using OpenAI;

namespace Api.Ai;

/// <summary>Arma el <see cref="IChatClient"/> de un proveedor. Un solo lugar conoce los SDK; el resto del código habla con la abstracción.</summary>
public interface IAiChatClientFactory
{
    IChatClient Create(AiProvider provider, string apiKey, string modelId, int maxOutputTokens);
}

/// <summary>
/// Crear un cliente no hace llamadas de red. Las URLs son constantes en código:
/// no hay campo de URL en el panel (una URL editable sería un SSRF con la clave adjunta).
/// </summary>
public sealed class AiChatClientFactory : IAiChatClientFactory
{
    public static readonly Uri GroqEndpoint = new("https://api.groq.com/openai/v1");

    private readonly HttpMessageHandler? _handler;

    public AiChatClientFactory() { }

    /// <summary>Solo para tests: todos los SDK mandan sus pedidos por <paramref name="handler"/>.</summary>
    internal AiChatClientFactory(HttpMessageHandler handler) => _handler = handler;

    public IChatClient Create(AiProvider provider, string apiKey, string modelId, int maxOutputTokens) =>
        provider switch
        {
            AiProvider.Anthropic => Anthropic(apiKey).AsIChatClient(modelId, maxOutputTokens),
            AiProvider.OpenAI => new OpenAIClient(new ApiKeyCredential(apiKey), OpenAiOptions(null)).GetChatClient(modelId).AsIChatClient(),
            AiProvider.Groq => new OpenAIClient(new ApiKeyCredential(apiKey), OpenAiOptions(GroqEndpoint)).GetChatClient(modelId).AsIChatClient(),
            AiProvider.Google => Google(apiKey).AsIChatClient(modelId),
            _ => throw new ArgumentOutOfRangeException(nameof(provider), provider, null),
        };

    // Ningún SDK reintenta por su cuenta: el único reintento es el respaldo del gateway, y el corte por
    // fallas cuenta pedidos, no tandas de reintentos.

    private AnthropicClient Anthropic(string apiKey) =>
        _handler is null
            ? new AnthropicClient { ApiKey = apiKey, MaxRetries = 0 }
            : new AnthropicClient { ApiKey = apiKey, MaxRetries = 0, HttpClient = Http() };

    private OpenAIClientOptions OpenAiOptions(Uri? endpoint)
    {
        var options = new OpenAIClientOptions { RetryPolicy = new ClientRetryPolicy(maxRetries: 0) };
        if (endpoint is not null) options.Endpoint = endpoint;
        if (_handler is not null) options.Transport = new HttpClientPipelineTransport(Http());
        return options;
    }

    // Sin RetryOptions Google ya hace un solo intento; se fija igual por si cambia el default del SDK.
    private Google.GenAI.Client Google(string apiKey)
    {
        var http = new Google.GenAI.Types.HttpOptions { RetryOptions = new Google.GenAI.Types.HttpRetryOptions { Attempts = 1 } };
        return _handler is null
            ? new Google.GenAI.Client(apiKey: apiKey, httpOptions: http)
            : new Google.GenAI.Client(apiKey: apiKey, httpOptions: http,
                clientOptions: new Google.GenAI.Types.ClientOptions { HttpClientFactory = Http });
    }

    private HttpClient Http() => new(_handler!, disposeHandler: false);
}
