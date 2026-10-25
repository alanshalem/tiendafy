using Ai.Infrastructure;
using Api.Ai;
using Microsoft.Extensions.AI;

namespace IntegrationTests;

/// <summary>
/// Los modelos de IA de los tests: reemplaza a <see cref="IAiChatClientFactory"/>, así que el gateway,
/// el medidor y el consumo son los de producción y ningún test llama a un proveedor. Se guioniza por
/// id de modelo del catálogo. <see cref="Respond"/> y <see cref="Throw"/> reemplazan el guion del
/// modelo y borran lo que había registrado de él.
/// </summary>
public sealed class FakeAi : IAiChatClientFactory
{
    private readonly object _gate = new();
    private readonly Dictionary<string, Script> _scripts = [];

    /// <summary>Las próximas respuestas del modelo, en orden. Si se acaban, la llamada falla.</summary>
    public void Respond(string modelId, params ChatResponse[] responses) =>
        Set(modelId, new Script(new Queue<ChatResponse>(responses), null));

    /// <summary>Toda llamada al modelo lanza <paramref name="error"/> (por ejemplo, un 401 como <c>HttpRequestException</c> con estado).</summary>
    public void Throw(string modelId, Exception error) => Set(modelId, new Script([], error));

    /// <summary>Los mensajes que recibió cada llamada al modelo.</summary>
    public IReadOnlyList<IReadOnlyList<ChatMessage>> Calls(string modelId)
    {
        lock (_gate) return [.. Get(modelId).Calls];
    }

    /// <summary>Las <see cref="ChatOptions"/> de cada llamada al modelo.</summary>
    public IReadOnlyList<ChatOptions?> Options(string modelId)
    {
        lock (_gate) return [.. Get(modelId).Options];
    }

    public IChatClient Create(AiProvider provider, string apiKey, string modelId, int maxOutputTokens) => new Client(this, modelId);

    private void Set(string modelId, Script script)
    {
        lock (_gate) _scripts[modelId] = script;
    }

    private Script Get(string modelId)
    {
        if (!_scripts.TryGetValue(modelId, out var script)) _scripts[modelId] = script = new Script([], null);
        return script;
    }

    private ChatResponse Next(string modelId, IEnumerable<ChatMessage> messages, ChatOptions? options)
    {
        lock (_gate)
        {
            var script = Get(modelId);
            script.Calls.Add(messages.ToList());
            script.Options.Add(options);
            if (script.Error is not null) throw script.Error;
            return script.Responses.TryDequeue(out var response)
                ? response
                : throw new InvalidOperationException($"FakeAi: no hay respuesta guionizada para {modelId}.");
        }
    }

    private sealed class Script(Queue<ChatResponse> responses, Exception? error)
    {
        public Queue<ChatResponse> Responses { get; } = responses;
        public Exception? Error { get; } = error;
        public List<IReadOnlyList<ChatMessage>> Calls { get; } = [];
        public List<ChatOptions?> Options { get; } = [];
    }

    private sealed class Client(FakeAi owner, string modelId) : IChatClient
    {
        public Task<ChatResponse> GetResponseAsync(
            IEnumerable<ChatMessage> messages, ChatOptions? options = null, CancellationToken cancellationToken = default) =>
            Task.FromResult(owner.Next(modelId, messages, options));

        public IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(
            IEnumerable<ChatMessage> messages, ChatOptions? options = null, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException("Ninguna tarea usa streaming en la v1.");

        public object? GetService(Type serviceType, object? serviceKey = null) => null;

        public void Dispose() { }
    }
}
