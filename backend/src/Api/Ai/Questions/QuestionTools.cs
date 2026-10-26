using Microsoft.Extensions.AI;
using SharedKernel.Common;

namespace Api.Ai.Questions;

/// <summary>
/// Herramientas de lectura que el modelo puede usar al redactar, elegidas por canal y categoría.
/// Ninguna escribe ni recibe parámetros: lo que leen queda atado por closure al ítem o pedido ya resuelto.
/// El <see cref="CancellationToken"/> de la lambda lo inyecta la fábrica y no aparece en el esquema JSON.
/// </summary>
public static class QuestionTools
{
    public const int MaxResultChars = 1_200;

    /// <summary>Lo que ve el modelo cuando el lector falla o tarda: no es una falla del proveedor de IA.</summary>
    public const string Unavailable = "No pude consultar este dato ahora.";

    /// <summary>
    /// Lo que ve el modelo si vuelve a llamar a una herramienta en la misma corrida: cada lector corre una sola
    /// vez por <see cref="DraftToolLog"/>, haya traído el dato o fallado. Sin I/O y sin marcar nada.
    /// </summary>
    public const string AlreadyGiven = "Ya te pasé este dato más arriba.";

    private const string OrderStatusDescription =
        "Devuelve el estado actual del pedido de esta conversación (pago, preparación, envío).";

    public static IReadOnlyList<AIFunction> For(DraftChannel channel, QuestionCategory category, DraftReaders readers, DraftToolLog log)
    {
        var tools = new List<AIFunction>();

        if (channel == DraftChannel.MeliQuestion)
        {
            switch (category)
            {
                case QuestionCategory.Stock or QuestionCategory.Price:
                    AddText(tools, log, readers.StockAndPrice, "stock_y_precio",
                        "Devuelve el precio y el stock actuales de la publicación por la que preguntan.");
                    break;
                case QuestionCategory.Product:
                    AddText(tools, log, readers.TechSheet, "ficha_tecnica",
                        "Devuelve la ficha técnica (atributos) de la publicación por la que preguntan.");
                    break;
            }
        }
        else if (channel is DraftChannel.MeliMessage or DraftChannel.SupportChat)
        {
            switch (category)
            {
                case QuestionCategory.Shipping:
                    AddTracking(tools, readers.Tracking, log);
                    break;
                case QuestionCategory.AfterSale:
                    AddText(tools, log, readers.OrderStatus, "estado_del_pedido", OrderStatusDescription);
                    AddTracking(tools, readers.Tracking, log);
                    break;
                case QuestionCategory.Other:
                    AddText(tools, log, readers.OrderStatus, "estado_del_pedido", OrderStatusDescription);
                    break;
            }
        }

        return tools;
    }

    /// <summary>Margen de tokens de entrada que suman las herramientas: cada resultado puede llegar a <see cref="MaxResultChars"/>.</summary>
    public static int AllowanceTokens(int toolCount) => toolCount * MaxResultChars / 3;

    private static void AddText(List<AIFunction> tools, DraftToolLog log, Func<CancellationToken, Task<string>>? reader, string name, string description)
    {
        if (reader is null) return;
        tools.Add(AIFunctionFactory.Create(
            async (CancellationToken ct) =>
            {
                if (!log.TryStart(name)) return AlreadyGiven;
                var text = await ReadAsync(reader, name, log, ct);
                return text is null ? Unavailable : Clip(text);
            },
            name, description));
    }

    private static void AddTracking(List<AIFunction> tools, Func<CancellationToken, Task<TrackingInfo>>? reader, DraftToolLog log)
    {
        if (reader is null) return;
        tools.Add(AIFunctionFactory.Create(
            async (CancellationToken ct) =>
            {
                if (!log.TryStart("seguimiento")) return AlreadyGiven;
                var info = await ReadAsync(reader, "seguimiento", log, ct);
                if (info is null) return Unavailable;
                if (info.HasDeliveryEstimate) log.MarkDeliveryEstimateKnown();
                if (info.References is { } references) log.AddReferences(references);
                return Clip(info.Text);
            },
            "seguimiento", "Devuelve el estado del envío de esta conversación y, si la hay, la fecha estimada de entrega."));
    }

    /// <summary>
    /// Corre el lector con un tope propio. Si lo excede o falla devuelve null (la herramienta responde un texto
    /// neutro): una herramienta lenta o rota no cuenta como falla del proveedor. La cancelación externa se propaga.
    /// </summary>
    private static async Task<T?> ReadAsync<T>(Func<CancellationToken, Task<T>> reader, string tool, DraftToolLog log, CancellationToken ct) where T : class
    {
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(log.ReaderTimeout);
        try
        {
            // WaitAsync corta por el tope aunque el lector ignore el token.
            return await reader(cts.Token).WaitAsync(cts.Token);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            log.RecordReaderFailure(tool, ex);
            return null;
        }
    }

    private static string Clip(string text) => Text.Clip(text, MaxResultChars) ?? "";
}
