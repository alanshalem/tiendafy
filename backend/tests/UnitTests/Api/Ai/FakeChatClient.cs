using Microsoft.Extensions.AI;

namespace UnitTests.Api.Ai;

/// <summary>
/// Cliente de chat de prueba: devuelve las respuestas del guion en orden. Guarda los mensajes
/// (<see cref="Calls"/>) y las <see cref="ChatOptions"/> (<see cref="Options"/>) de cada llamada,
/// para afirmar qué herramientas y qué formato recibió el modelo.
/// </summary>
public sealed class FakeChatClient(params ChatResponse[] script) : IChatClient
{
    private int _next;

    public List<IReadOnlyList<ChatMessage>> Calls { get; } = [];
    public List<ChatOptions?> Options { get; } = [];

    public Task<ChatResponse> GetResponseAsync(
        IEnumerable<ChatMessage> messages, ChatOptions? options = null, CancellationToken cancellationToken = default)
    {
        Calls.Add(messages.ToList());
        Options.Add(options);
        if (_next >= script.Length)
            throw new InvalidOperationException("El guion de FakeChatClient se quedó sin respuestas.");
        return Task.FromResult(script[_next++]);
    }

    public IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(
        IEnumerable<ChatMessage> messages, ChatOptions? options = null, CancellationToken cancellationToken = default) =>
        throw new NotSupportedException("Ninguna tarea usa streaming en la v1.");

    public object? GetService(Type serviceType, object? serviceKey = null) => null;

    public void Dispose() { }
}
