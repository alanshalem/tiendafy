using Ai.Infrastructure;
using Api.Ai;
using Microsoft.Extensions.AI;
using SharedKernel.Common;

namespace Api.Purchasing;

/// <summary>
/// La costura de la lectura de facturas con los modelos. Una llamada al modelo es una ejecución del gateway:
/// la reserva del tope es el peor caso de UNA vuelta, así que cada paso de la cadena (leer, corregir,
/// emparejar) reserva la suya con su propia estimación.
/// </summary>
public interface IInvoiceModel
{
    Task<Result<ChatResponse>> AskAsync(
        string system, IReadOnlyList<ChatMessage> conversation, ChatResponseFormat format,
        int estimatedInputTokens, CancellationToken ct);
}

public sealed class GatewayInvoiceModel(IAiGateway gateway) : IInvoiceModel
{
    public Task<Result<ChatResponse>> AskAsync(
        string system, IReadOnlyList<ChatMessage> conversation, ChatResponseFormat format,
        int estimatedInputTokens, CancellationToken ct) =>
        gateway.RunAsync(
            AiTask.InvoiceRead,
            new AiRunOptions(estimatedInputTokens),
            (ctx, token) =>
            {
                var options = ctx.NewOptions();
                options.ResponseFormat = format;
                return ctx.Chat.GetResponseAsync([ctx.System(system), .. conversation], options, token);
            },
            ct);
}
