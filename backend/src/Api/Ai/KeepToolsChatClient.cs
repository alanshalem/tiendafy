using Microsoft.Extensions.AI;

namespace Api.Ai;

/// <summary>
/// Va debajo de <see cref="FunctionInvokingChatClient"/>. Ese cliente hace su última vuelta sin
/// herramientas (<c>PrepareOptionsForLastIteration</c> saca las <see cref="AIFunctionDeclaration"/>), pero
/// el historial ya trae <see cref="FunctionCallContent"/> y <see cref="FunctionResultContent"/>, y la API de
/// Anthropic rechaza con 400 un pedido con bloques <c>tool_use</c>/<c>tool_result</c> y sin <c>tools</c>.
/// Acá se vuelven a poner las herramientas de la corrida con <see cref="ChatToolMode.None"/>: el modelo las
/// ve (para validar el historial) pero no puede llamarlas, y contesta con lo que tiene.
/// </summary>
internal sealed class KeepToolsChatClient(IChatClient inner) : DelegatingChatClient(inner)
{
    private IList<AITool>? _tools;

    public override Task<ChatResponse> GetResponseAsync(
        IEnumerable<ChatMessage> messages, ChatOptions? options = null, CancellationToken cancellationToken = default)
    {
        var list = messages as IReadOnlyCollection<ChatMessage> ?? messages.ToList();
        return base.GetResponseAsync(list, Restore(list, options), cancellationToken);
    }

    public override IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(
        IEnumerable<ChatMessage> messages, ChatOptions? options = null, CancellationToken cancellationToken = default)
    {
        var list = messages as IReadOnlyCollection<ChatMessage> ?? messages.ToList();
        return base.GetStreamingResponseAsync(list, Restore(list, options), cancellationToken);
    }

    private ChatOptions? Restore(IReadOnlyCollection<ChatMessage> messages, ChatOptions? options)
    {
        if (options?.Tools is { Count: > 0 } tools)
        {
            _tools = tools;
            return options;
        }
        if (options is null || _tools is null || !HasToolContent(messages)) return options;

        var restored = options.Clone();
        restored.Tools = _tools;
        restored.ToolMode = ChatToolMode.None;
        return restored;
    }

    private static bool HasToolContent(IEnumerable<ChatMessage> messages) =>
        messages.Any(m => m.Contents.Any(c => c is FunctionCallContent or FunctionResultContent));
}
