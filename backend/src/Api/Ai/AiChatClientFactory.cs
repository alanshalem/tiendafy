using System.ClientModel;
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

    public IChatClient Create(AiProvider provider, string apiKey, string modelId, int maxOutputTokens) =>
        provider switch
        {
            AiProvider.Anthropic => new AnthropicClient { ApiKey = apiKey }.AsIChatClient(modelId, maxOutputTokens),
            AiProvider.OpenAI => new OpenAIClient(apiKey).GetChatClient(modelId).AsIChatClient(),
            AiProvider.Groq => new OpenAIClient(new ApiKeyCredential(apiKey), new OpenAIClientOptions { Endpoint = GroqEndpoint })
                .GetChatClient(modelId).AsIChatClient(),
            AiProvider.Google => new Google.GenAI.Client(apiKey: apiKey).AsIChatClient(modelId),
            _ => throw new ArgumentOutOfRangeException(nameof(provider), provider, null),
        };
}
