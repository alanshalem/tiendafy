using Ai.Infrastructure;
using Microsoft.Extensions.AI;

namespace Api.Ai;

/// <summary>
/// Mide cada respuesta del modelo: registra una fila de consumo y le informa el costo real a la
/// reserva. Normaliza los tokens para que el costo sea el mismo sin importar el proveedor:
/// <c>Input = max(0, InputTokenCount - CachedInputTokenCount)</c> y <c>Cached = CachedInputTokenCount</c>.
/// El adaptador de Anthropic ya informa en <c>InputTokenCount</c> lectura de caché + escritura de caché +
/// entrada sin caché, así que la escritura de caché no se suma otra vez: queda cobrada al precio de
/// entrada (es un poco menos que el recargo real si algún día se usa caché explícita).
/// Registrar el consumo nunca rompe la llamada: si el insert falla se loguea y se sigue, y la reserva
/// se informa antes de tocar la base.
/// </summary>
public sealed class MeteringChatClient(
    IChatClient inner,
    IAiUsageRecorder recorder,
    AiUsageEntry template,
    AiReservation? reservation,
    ILogger<MeteringChatClient>? logger = null) : DelegatingChatClient(inner)
{
    public override async Task<ChatResponse> GetResponseAsync(
        IEnumerable<ChatMessage> messages, ChatOptions? options = null, CancellationToken cancellationToken = default)
    {
        ChatResponse response;
        try
        {
            response = await base.GetResponseAsync(messages, options, cancellationToken);
        }
        catch
        {
            await RecordAsync(0, 0, 0, AiOutcome.Error);
            throw;
        }

        var (input, cached, output) = Normalize(response.Usage);
        if (response.Usage is null)
            logger?.LogWarning("La respuesta de {Model} no trae uso de tokens: se registra en 0.", template.Model.Id);
        await RecordAsync(input, cached, output, template.Outcome);
        return response;
    }

    // Ninguna tarea de la v1 usa streaming: se deja pasar al cliente de adentro SIN medir.
    // Si alguna lo usa, hay que medirlo acá (el uso llega en la última actualización).
    public override IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(
        IEnumerable<ChatMessage> messages, ChatOptions? options = null, CancellationToken cancellationToken = default) =>
        base.GetStreamingResponseAsync(messages, options, cancellationToken);

    private static (long Input, long Cached, long Output) Normalize(UsageDetails? usage)
    {
        if (usage is null) return (0, 0, 0);
        var cached = usage.CachedInputTokenCount ?? 0;
        var input = Math.Max(0, (usage.InputTokenCount ?? 0) - cached);
        return (input, cached, usage.OutputTokenCount ?? 0);
    }

    private async Task RecordAsync(long input, long cached, long output, AiOutcome outcome)
    {
        var cost = AiCost.MicroUsd(template.Model, input, cached, output);
        reservation?.AddActual(cost);
        try
        {
            // Token None: si el pedido se cancela después de que el proveedor respondió (y cobró),
            // la fila igual tiene que quedar.
            await recorder.RecordAsync(template with
            {
                InputTokens = input,
                CachedInputTokens = cached,
                OutputTokens = output,
                Outcome = outcome,
                CostMicroUsd = cost,
            }, CancellationToken.None);
        }
        catch (Exception ex)
        {
            logger?.LogError(ex, "No se pudo registrar el consumo de {Model} ({CostMicroUsd} micro-USD).", template.Model.Id, cost);
        }
    }
}
