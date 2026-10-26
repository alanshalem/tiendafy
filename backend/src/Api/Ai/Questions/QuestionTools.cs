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

    /// <summary>Tope por lector. Interno y mutable solo para que los tests no esperen 5 segundos.</summary>
    internal static TimeSpan ReaderTimeout { get; set; } = TimeSpan.FromSeconds(5);

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
                    AddText(tools, readers.StockAndPrice, "stock_y_precio",
                        "Devuelve el precio y el stock actuales de la publicación por la que preguntan.");
                    break;
                case QuestionCategory.Product:
                    AddText(tools, readers.TechSheet, "ficha_tecnica",
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
                    AddText(tools, readers.OrderStatus, "estado_del_pedido", OrderStatusDescription);
                    AddTracking(tools, readers.Tracking, log);
                    break;
                case QuestionCategory.Other:
                    AddText(tools, readers.OrderStatus, "estado_del_pedido", OrderStatusDescription);
                    break;
            }
        }

        return tools;
    }

    /// <summary>Margen de tokens de entrada que suman las herramientas: cada resultado puede llegar a <see cref="MaxResultChars"/>.</summary>
    public static int AllowanceTokens(int toolCount) => toolCount * MaxResultChars / 3;

    private static void AddText(List<AIFunction> tools, Func<CancellationToken, Task<string>>? reader, string name, string description)
    {
        if (reader is null) return;
        tools.Add(AIFunctionFactory.Create(
            async (CancellationToken ct) =>
            {
                var text = await ReadAsync(reader, ct);
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
                var info = await ReadAsync(reader, ct);
                if (info is null) return Unavailable;
                if (info.HasDeliveryEstimate) log.MarkDeliveryEstimateKnown();
                return Clip(info.Text);
            },
            "seguimiento", "Devuelve el estado del envío de esta conversación y, si la hay, la fecha estimada de entrega."));
    }

    /// <summary>
    /// Corre el lector con un tope propio. Si lo excede o falla devuelve null (la herramienta responde un texto
    /// neutro): una herramienta lenta o rota no cuenta como falla del proveedor. La cancelación externa se propaga.
    /// </summary>
    private static async Task<T?> ReadAsync<T>(Func<CancellationToken, Task<T>> reader, CancellationToken ct) where T : class
    {
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(ReaderTimeout);
        try
        {
            return await reader(cts.Token);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception)
        {
            return null;
        }
    }

    private static string Clip(string text) => Text.Clip(text, MaxResultChars) ?? "";
}
