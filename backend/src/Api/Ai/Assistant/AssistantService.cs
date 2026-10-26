using Ai.Infrastructure;
using Identity.Infrastructure;
using Microsoft.Extensions.AI;
using SharedKernel.Common;

namespace Api.Ai.Assistant;

public sealed record AssistantRequest(string? Question, AssistantTurn[]? History);

/// <param name="Sources">Qué herramientas se consultaron, para mostrar "Consulté: …".</param>
/// <param name="Limited">La respuesta quedó a medias (se cortó o no llegó a una respuesta completa).</param>
public sealed record AssistantResponse(string Answer, string[] Sources, bool Limited);

/// <summary>
/// "Preguntale a tu tienda": una pregunta, las herramientas de solo lectura que permite el rol de quien
/// pregunta, y una respuesta. Una pregunta a la vez por usuario. No guarda ni loguea la pregunta ni la respuesta.
/// </summary>
public sealed class AssistantService(
    IAiGateway gateway, AiConcurrency concurrency, AssistantToolset toolset, TimeProvider clock)
{
    public const string Incomplete =
        "No llegué a una respuesta completa con los pasos que tengo. Probá con una pregunta más concreta o un período más corto.";

    public async Task<Result<AssistantResponse>> AskAsync(
        Guid userId, MemberAccess access, AssistantRequest request, CancellationToken ct)
    {
        var question = request.Question?.Trim() ?? "";
        if (question.Length == 0)
            return Result.Failure<AssistantResponse>(Error.Validation("Assistant.EmptyQuestion", "Escribí una pregunta."));
        if (question.Length > AssistantPrompt.MaxQuestionChars)
            return Result.Failure<AssistantResponse>(Error.Validation("Assistant.QuestionTooLong",
                $"La pregunta es muy larga: el máximo es {AssistantPrompt.MaxQuestionChars} caracteres."));

        using var turn = concurrency.TryEnter("assistant", userId.ToString("N"));
        if (turn is null) return Result.Failure<AssistantResponse>(AiErrors.Busy);

        // El servidor recorta aunque el panel ya lo haga: el cliente es quien manda el historial.
        var history = AssistantHistory.Clip(request.History);
        var today = ArgentinaTime.DateOf(clock.GetUtcNow().UtcDateTime);
        var estimate = AssistantPrompt.EstimateInputTokens(question, history, AssistantToolCatalog.Allowed(access).Count());

        return await gateway.RunAsync(
            AiTask.DataAssistant,
            new AiRunOptions(estimate),
            async (ctx, token) =>
            {
                // Registro y herramientas nuevos por intento: si corre el respaldo, arranca de cero.
                var log = new AssistantInvocationLog(AssistantPrompt.ToolResultsBudgetChars);
                var options = ctx.NewOptions();
                options.Tools = toolset.For(access, log);

                List<ChatMessage> messages =
                [
                    ctx.System(AssistantPrompt.System),
                    .. AssistantHistory.ToMessages(history),
                    AssistantPrompt.Question(question, today),
                ];
                var response = await ctx.WithTools().GetResponseAsync(messages, options, token);

                // Solo la respuesta final: lo que el modelo dijo antes de llamar a una herramienta no es la respuesta.
                // Si el último mensaje todavía pide una herramienta, se acabaron las vueltas: lo que dice es narración.
                var text = response.FinalText();
                var unfinished = response.Messages.LastOrDefault(m => m.Role == ChatRole.Assistant)?
                    .Contents.OfType<FunctionCallContent>().Any() == true;
                string[] sources = [.. log.Labels.Distinct()];
                return text.Length == 0 || unfinished
                    ? new AssistantResponse(Incomplete, sources, true)
                    : new AssistantResponse(text, sources, response.FinishReason == ChatFinishReason.Length);
            },
            ct);
    }
}
