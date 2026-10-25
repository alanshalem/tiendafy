using Ai.Infrastructure;
using Microsoft.Extensions.AI;

namespace Api.Ai;

/// <summary>
/// Mide cada respuesta del modelo: registra una fila de consumo y le informa el costo real a la
/// reserva. Normaliza los tokens para que el costo sea el mismo sin importar el proveedor:
/// <c>Input = InputTokenCount - CachedInputTokenCount</c> y <c>Cached = CachedInputTokenCount</c>.
/// En Anthropic, lo que se escribe en caché (<c>CacheCreationInputTokens</c>) se suma a la entrada:
/// en esta versión se cobra al precio de entrada, no al recargo de escritura (es un poco menos que
/// lo real si algún día se usa caché explícita).
/// </summary>
public sealed class MeteringChatClient(
    IChatClient inner,
    IAiUsageRecorder recorder,
    AiUsageEntry template,
    AiReservation? reservation,
    ILogger<MeteringChatClient>? logger = null) : DelegatingChatClient(inner)
{
    private const string CacheCreationKey = "CacheCreationInputTokens";

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
            // Registrar el error no tiene que depender del token cancelado que lo provocó.
            await RecordAsync(0, 0, 0, AiOutcome.Error, CancellationToken.None);
            throw;
        }

        var (input, cached, output) = Normalize(response.Usage);
        if (response.Usage is null)
            logger?.LogWarning("La respuesta de {Model} no trae uso de tokens: se registra en 0.", template.Model.Id);
        await RecordAsync(input, cached, output, template.Outcome, cancellationToken);
        return response;
    }

    // Ninguna tarea de la v1 usa streaming: se deja pasar al cliente de adentro SIN medir.
    // Si alguna lo usa, hay que medirlo acá (el uso llega en la última actualización).
    public override IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(
        IEnumerable<ChatMessage> messages, ChatOptions? options = null, CancellationToken cancellationToken = default) =>
        base.GetStreamingResponseAsync(messages, options, cancellationToken);

    private (long Input, long Cached, long Output) Normalize(UsageDetails? usage)
    {
        if (usage is null) return (0, 0, 0);
        var cached = usage.CachedInputTokenCount ?? 0;
        var input = (usage.InputTokenCount ?? 0) - cached;
        if (template.Model.Provider == AiProvider.Anthropic
            && usage.AdditionalCounts is { } counts
            && counts.TryGetValue(CacheCreationKey, out var written))
            input += written;
        return (input, cached, usage.OutputTokenCount ?? 0);
    }

    private async Task RecordAsync(long input, long cached, long output, AiOutcome outcome, CancellationToken ct)
    {
        await recorder.RecordAsync(template with
        {
            InputTokens = input,
            CachedInputTokens = cached,
            OutputTokens = output,
            Outcome = outcome,
        }, ct);
        reservation?.AddActual(AiCost.MicroUsd(template.Model, input, cached, output));
    }
}
