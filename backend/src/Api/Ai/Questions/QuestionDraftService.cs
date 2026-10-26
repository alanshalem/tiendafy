using Ai.Infrastructure;
using Microsoft.Extensions.AI;
using SharedKernel.Common;

namespace Api.Ai.Questions;

/// <summary>
/// Lo que vuelve al panel. <c>Category</c> va en el formato del cable (<c>stock</c>, <c>fuera_de_politica</c>…).
/// <c>Reason</c> es texto libre del clasificador: el panel lo muestra como texto plano y nunca vuelve a un prompt.
/// </summary>
public sealed record DraftResult(string? Text, string Category, string? Reason, bool Manual, IReadOnlyList<DraftWarning> Warnings);

/// <summary>
/// Orquesta un borrador de la bandeja: redacta el hilo, lo clasifica, y si la consulta se puede contestar, lo
/// redacta con las herramientas de esa categoría y le pasa los avisos deterministas. Nunca escribe en ningún
/// lado: el borrador vuelve al panel y responder sigue siendo el botón de siempre.
/// </summary>
public sealed class QuestionDraftService(IAiGateway gateway, ILogger<QuestionDraftService> logger)
{
    /// <summary>Cuántos mensajes del hilo, los últimos, llegan al modelo.</summary>
    public const int ThreadLines = 6;

    public const string ThreadTag = "mensajes_del_comprador";

    /// <summary>Para los tests: un registro con un tope de lectura corto.</summary>
    internal Func<DraftToolLog> NewToolLog { get; init; } = () => new DraftToolLog();

    public async Task<Result<DraftResult>> DraftAsync(DraftSubject subject, CancellationToken ct)
    {
        var lines = subject.Thread.Where(l => !string.IsNullOrWhiteSpace(l.Text)).TakeLast(ThreadLines).ToList();
        if (!lines.Any(l => !l.FromSeller)) return Result.Failure<DraftResult>(QuestionDraftErrors.NothingToAnswer);
        var thread = UntrustedText.Wrap(ThreadTag, string.Join("\n", lines.Select(Render)));

        var classified = await QuestionClassifier.RunAsync(gateway, subject.Channel, thread, ct);
        if (classified.IsFailure) return Result.Failure<DraftResult>(classified.Error);
        var (category, reason) = classified.Value;
        var wire = QuestionCategories.Wire(category);
        var shownReason = string.IsNullOrWhiteSpace(reason) ? null : reason;

        // Sin segunda corrida: lo que está fuera de política se contesta a mano.
        if (category == QuestionCategory.OutOfPolicy)
            return new DraftResult(null, wire, shownReason, Manual: true, []);

        var system = QuestionPrompts.DraftSystem(subject.Channel);
        // El motivo del clasificador NO entra: es texto del modelo que puede repetir al comprador.
        var user = $"{QuestionPrompts.CategoryHint(subject.Channel, category)}\n\nContexto:\n{subject.Context}\n\n{thread}";
        var toolCount = QuestionTools.For(subject.Channel, category, subject.Readers, new DraftToolLog()).Count;
        var estimate = QuestionPrompts.EstimateTokens(system, user) + QuestionTools.AllowanceTokens(toolCount);

        // Un registro por intento (principal y respaldo): las fallas de todos se loguean, no solo las del último.
        var logs = new List<DraftToolLog>();
        var drafted = await gateway.RunAsync(
            AiTask.QuestionDraft,
            new AiRunOptions(estimate),
            async (ctx, token) =>
            {
                // Herramientas nuevas por intento: si corre el respaldo, arranca con su propio registro.
                var log = NewToolLog();
                logs.Add(log);
                var tools = QuestionTools.For(subject.Channel, category, subject.Readers, log);
                var options = ctx.NewOptions();
                var chat = ctx.Chat;
                if (tools.Count > 0)
                {
                    options.Tools = [.. tools];
                    chat = ctx.WithTools();
                }

                var response = await chat.GetResponseAsync(
                    [ctx.System(system), new ChatMessage(ChatRole.User, user)], options, token);
                return (Text: response.Text?.Trim() ?? "", Log: log);
            },
            ct);

        foreach (var log in logs) LogReaderFailures(log);
        if (drafted.IsFailure) return Result.Failure<DraftResult>(drafted.Error);

        var (text, toolLog) = drafted.Value;
        if (text.Length == 0) return Result.Failure<DraftResult>(QuestionDraftErrors.EmptyDraft);

        var warnings = DraftGuardrails.Check(text, new DraftFacts(
            DraftLimits.MaxLength(subject.Channel), subject.KnownAmountsMinor, toolLog.DeliveryEstimateKnown));
        return new DraftResult(text, wire, shownReason, Manual: false, warnings);
    }

    /// <summary>
    /// Cada línea del hilo, ya sin datos personales y en una sola línea: un salto de línea del comprador no
    /// puede inventar un mensaje del vendedor.
    /// </summary>
    private static string Render(ThreadLine line)
    {
        var text = PiiRedactor.Redact(line.Text).ReplaceLineEndings(" ").Trim();
        return $"{(line.FromSeller ? "Vendedor" : "Comprador")}: {text}";
    }

    /// <summary>Solo la herramienta, el tipo de excepción y si fue por tiempo: el mensaje puede traer datos.</summary>
    private void LogReaderFailures(DraftToolLog log)
    {
        foreach (var (tool, exceptionType, timedOut) in log.ReaderFailures)
        {
            logger.LogWarning("Borrador de IA: la herramienta {Tool} no pudo leer ({ExceptionType}, por tiempo: {TimedOut}).",
                tool, exceptionType, timedOut);
        }
    }
}
