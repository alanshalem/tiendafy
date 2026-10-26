using Api.Ai;
using Api.Purchasing;
using Microsoft.Extensions.AI;
using SharedKernel.Common;

namespace UnitTests.Api.Purchasing;

/// <summary>
/// <see cref="IInvoiceModel"/> de prueba: antepone el system prompt y llama directo al cliente (un
/// <c>FakeChatClient</c>), sin gateway. Guarda lo que se estimó en cada llamada. Una excepción del cliente
/// vuelve como <see cref="AiErrors.Failed"/>, igual que en el gateway.
/// </summary>
public sealed class ChatClientInvoiceModel(IChatClient chat) : IInvoiceModel
{
    public List<int> Estimates { get; } = [];

    public async Task<Result<ChatResponse>> AskAsync(
        string system, IReadOnlyList<ChatMessage> conversation, ChatResponseFormat format,
        int estimatedInputTokens, CancellationToken ct)
    {
        Estimates.Add(estimatedInputTokens);
        try
        {
            var response = await chat.GetResponseAsync(
                [new ChatMessage(ChatRole.System, system), .. conversation],
                new ChatOptions { ResponseFormat = format }, ct);
            return response;
        }
        catch (InvalidOperationException)
        {
            return Result.Failure<ChatResponse>(AiErrors.Failed);
        }
    }
}
