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
        catch (Exception ex)
        {
            // La marca dice que la excepción salió del proveedor (y no de una herramienta o del cuerpo):
            // solo esas cuentan como caída. Se marca sin envolverla, así el cuerpo la ve con su tipo.
            ex.Data[ProviderMark] = true;
            await RecordAsync(0, 0, 0, AiOutcome.Error);
            throw;
        }

        var (input, cached, output) = Normalize(response.Usage);
        if (response.Usage is null)
            logger?.LogWarning("La respuesta de {Model} no trae uso de tokens: se registra en 0.", template.Model.Id);
        await RecordAsync(input, cached, output, template.Outcome);
        return response;
    }

    // Ninguna tarea de la v1 usa streaming. Dejarlo pasar sería gastar sin medir y sin tope: si alguna
    // lo necesita, hay que medirlo acá (el uso llega en la última actualización).
    public override IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(
        IEnumerable<ChatMessage> messages, ChatOptions? options = null, CancellationToken cancellationToken = default) =>
        throw new NotSupportedException("MeteringChatClient no mide el streaming: usá GetResponseAsync.");

    private const string ProviderMark = "Tiendafy.Ai.FromProvider";

    /// <summary>
    /// Si <paramref name="ex"/>, o una de las de adentro, salió de la llamada al proveedor (la marca este
    /// medidor). Lo que tira una herramienta o el cuerpo no pasa por acá y no queda marcado.
    /// </summary>
    internal static bool CameFromProvider(Exception ex)
    {
        for (var e = ex; e is not null; e = e.InnerException)
        {
            if (e.Data[ProviderMark] is true) return true;
        }
        return false;
    }

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
